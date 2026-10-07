<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleReturnRequest;
use App\Http\Resources\SaleReturnResource;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SerialService;
use App\Services\StockService;
use App\Support\Qty;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleReturnController extends Controller
{
    public function store(StoreSaleReturnRequest $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }

        if ($sale->status === 'held') {
            return response()->json([
                'message' => 'Held sales have no stock movement yet and cannot be returned. Resume it first.',
            ], 422);
        }

        $validated = $request->validated();
        $user = $request->user();

        $saleReturn = DB::transaction(function () use ($validated, $sale, $user) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();

            if ($sale->status === 'held') {
                throw ValidationException::withMessages([
                    'items' => ['Held sales have no stock movement yet and cannot be returned. Resume it first.'],
                ]);
            }

            $saleItemIds = collect($validated['items'])->pluck('sale_item_id');
            $saleItems = SaleItem::where('sale_id', $sale->id)->whereIn('id', $saleItemIds)->get()->keyBy('id');

            // Sum requested quantities per sale_item_id first, so duplicate
            // lines for the same item in one request can't each pass the
            // check individually and cumulatively over-return.
            $requestedBySaleItem = collect($validated['items'])
                ->groupBy('sale_item_id')
                ->map(fn ($rows) => Qty::round($rows->sum('quantity_returned')));

            foreach ($requestedBySaleItem as $saleItemId => $requestedQty) {
                if (! $saleItems->has($saleItemId)) {
                    throw ValidationException::withMessages([
                        'items' => ['One or more items do not belong to this sale.'],
                    ]);
                }

                $saleItem = $saleItems[$saleItemId];
                $alreadyReturned = SaleReturnItem::where('sale_item_id', $saleItem->id)->sum('quantity_returned');

                if ($requestedQty > Qty::round($saleItem->quantity - $alreadyReturned)) {
                    throw ValidationException::withMessages([
                        'items' => ["Cannot return more than the remaining quantity for item #{$saleItem->id}."],
                    ]);
                }
            }

            $totalRefund = 0;
            $saleReturn = SaleReturn::create([
                'sale_id' => $sale->id,
                'return_date' => $validated['return_date'] ?? now()->toDateString(),
                'reason' => $validated['reason'] ?? null,
                'total_refund' => 0,
                'processed_by' => $user->id,
            ]);

            $variantIds = $saleItems->pluck('variant_id')->unique();
            $variants = ProductVariant::withTrashed()->whereIn('id', $variantIds)->lockForUpdate()->get()->keyBy('id');

            // Scale each line's raw (pre sale-level discount/tax) value by how
            // much of the subtotal the customer actually ended up paying, so a
            // return on a discounted/taxed sale refunds the real amount paid
            // for those units — not the full pre-discount price.
            $ratio = $sale->subtotal > 0 ? $sale->grand_total / $sale->subtotal : 1;

            foreach ($validated['items'] as $item) {
                $saleItem = $saleItems[$item['sale_item_id']];
                $unitPrice = $saleItem->quantity > 0 ? $saleItem->total_price / $saleItem->quantity : 0;
                $refundAmount = round($unitPrice * $item['quantity_returned'] * $ratio, 2);
                $totalRefund += $refundAmount;

                SaleReturnItem::create([
                    'return_id' => $saleReturn->id,
                    'sale_item_id' => $saleItem->id,
                    'variant_id' => $saleItem->variant_id,
                    'quantity_returned' => $item['quantity_returned'],
                    'refund_amount' => $refundAmount,
                ]);

                $saleItem->setRelation('variant', $variants[$saleItem->variant_id]);
                SerialService::returnFromCustomer($saleItem, SerialService::clean($item['serials'] ?? [], 'items.serials'), (float) $item['quantity_returned'], 'items.serials');
                BatchService::returnForSale($saleItem, (float) $item['quantity_returned']);
                StockService::increment($variants[$saleItem->variant_id], $item['quantity_returned'], 'in', $user, $saleReturn, 'Return for '.$sale->invoice_number);
            }

            $saleReturn->update(['total_refund' => $totalRefund]);

            $allItemsFullyReturned = $sale->items()->get()->every(function (SaleItem $saleItem) {
                $returned = SaleReturnItem::where('sale_item_id', $saleItem->id)->sum('quantity_returned');

                return Qty::round($returned) >= Qty::round($saleItem->quantity);
            });

            // Returned goods no longer need to be paid for — credit the refunded
            // value against paid_amount so due_amount reflects what's still owed
            // on the items the customer actually kept. Capped so a full return
            // always clears the due completely, even though refund_amount (raw
            // unit price) doesn't account for proportional discount/tax.
            $sale->paid_amount = min($sale->grand_total, $sale->paid_amount + $totalRefund);
            $sale->refunded_amount += $totalRefund;
            $sale->syncPaymentStatus();
            if ($allItemsFullyReturned) {
                $sale->status = 'returned';
            }
            $sale->save();

            if ($sale->customer_id) {
                Customer::where('id', $sale->customer_id)->decrement('total_purchases', $totalRefund);
            }

            ActivityLogger::log($user, 'return', 'sales', "Processed return for sale {$sale->invoice_number}.");

            return $saleReturn;
        });

        return new SaleReturnResource($saleReturn->load(['sale', 'processor', 'items']));
    }
}
