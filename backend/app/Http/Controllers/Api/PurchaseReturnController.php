<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseReturnRequest;
use App\Http\Resources\PurchaseReturnResource;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\PurchaseReturn;
use App\Models\PurchaseReturnItem;
use App\Models\ProductVariant;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SerialService;
use App\Services\StockService;
use App\Support\Qty;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseReturnController extends Controller
{
    public function store(StorePurchaseReturnRequest $request, Purchase $purchase)
    {
        $validated = $request->validated();
        $user = $request->user();

        $purchaseReturn = DB::transaction(function () use ($validated, $purchase, $user) {
            $purchase = Purchase::whereKey($purchase->id)->lockForUpdate()->firstOrFail();

            $purchaseItemIds = collect($validated['items'])->pluck('purchase_item_id');
            $purchaseItems = PurchaseItem::where('purchase_id', $purchase->id)->whereIn('id', $purchaseItemIds)->get()->keyBy('id');

            // Sum requested quantities per line first so duplicate lines for
            // the same item in one request can't each pass the check
            // individually and cumulatively over-return.
            $requestedByPurchaseItem = collect($validated['items'])
                ->groupBy('purchase_item_id')
                ->map(fn ($rows) => Qty::round($rows->sum('quantity_returned')));

            foreach ($requestedByPurchaseItem as $purchaseItemId => $requestedQty) {
                if (! $purchaseItems->has($purchaseItemId)) {
                    throw ValidationException::withMessages([
                        'items' => ['One or more items do not belong to this purchase.'],
                    ]);
                }

                $purchaseItem = $purchaseItems[$purchaseItemId];
                $alreadyReturned = PurchaseReturnItem::where('purchase_item_id', $purchaseItem->id)->sum('quantity_returned');

                if ($requestedQty > Qty::round($purchaseItem->quantity - $alreadyReturned)) {
                    throw ValidationException::withMessages([
                        'items' => ["Cannot return more than the remaining quantity for item #{$purchaseItem->id}."],
                    ]);
                }
            }

            $variantIds = $purchaseItems->pluck('variant_id')->unique();
            $variants = ProductVariant::withTrashed()->whereIn('id', $variantIds)->lockForUpdate()->get()->keyBy('id');

            // Stock actually on the shelf must cover what's being sent back,
            // otherwise the return is impossible to fulfil physically.
            foreach ($requestedByPurchaseItem as $purchaseItemId => $requestedQty) {
                $variant = $variants[$purchaseItems[$purchaseItemId]->variant_id];
                if ($variant->stock_qty < $requestedQty) {
                    throw ValidationException::withMessages([
                        'items' => ["Insufficient stock for {$variant->sku} to return. Available: {$variant->stock_qty}."],
                    ]);
                }
            }

            $totalRefund = 0;
            $purchaseReturn = PurchaseReturn::create([
                'purchase_id' => $purchase->id,
                'return_date' => $validated['return_date'] ?? now()->toDateString(),
                'reason' => $validated['reason'] ?? null,
                'total_refund' => 0,
                'processed_by' => $user->id,
            ]);

            // Scale each line's raw value by how much of the purchase total
            // was actually paid after discount, mirroring sale returns.
            $ratio = $purchase->total_amount > 0 ? $purchase->grand_total / $purchase->total_amount : 1;

            foreach ($validated['items'] as $item) {
                $purchaseItem = $purchaseItems[$item['purchase_item_id']];
                $unitPrice = $purchaseItem->quantity > 0 ? $purchaseItem->total_price / $purchaseItem->quantity : 0;
                $refundAmount = round($unitPrice * $item['quantity_returned'] * $ratio, 2);
                $totalRefund += $refundAmount;

                PurchaseReturnItem::create([
                    'return_id' => $purchaseReturn->id,
                    'purchase_item_id' => $purchaseItem->id,
                    'variant_id' => $purchaseItem->variant_id,
                    'quantity_returned' => $item['quantity_returned'],
                    'refund_amount' => $refundAmount,
                ]);

                $variant = $variants[$purchaseItem->variant_id];
                SerialService::remove($variant, SerialService::clean($item['serials'] ?? [], 'items.serials'), (float) $item['quantity_returned'], 'items.serials', 'returned_to_supplier');
                // goods go back from the batch this purchase created, if any
                $batchId = \App\Models\ProductBatch::where('purchase_item_id', $purchaseItem->id)->value('id');
                BatchService::consume($variant, (float) $item['quantity_returned'], $batchId);
                StockService::decrement($variant, $item['quantity_returned'], 'out', $user, $purchaseReturn, 'Return to supplier for '.$purchase->po_number);
            }

            $purchaseReturn->update(['total_refund' => $totalRefund]);

            // Goods sent back reduce what we still owe the supplier — credit
            // it against paid_amount, capped so due never goes negative.
            $purchase->paid_amount = min($purchase->grand_total, $purchase->paid_amount + $totalRefund);
            $purchase->refunded_amount += $totalRefund;
            $purchase->syncPaymentStatus();
            $purchase->save();

            ActivityLogger::log($user, 'return', 'purchases', "Processed return for purchase {$purchase->po_number}.");

            return $purchaseReturn;
        });

        return new PurchaseReturnResource($purchaseReturn->load(['purchase', 'processor', 'items']));
    }
}
