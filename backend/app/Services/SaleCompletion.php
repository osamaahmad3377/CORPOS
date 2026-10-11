<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use App\Support\Qty;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Turns a held (unpaid) bill into a completed sale: stock, serials, batches,
 * kitchen ingredients, customer totals and loyalty points. Used by "Take
 * payment" on an open order and by delivery (rider brings the money back).
 */
class SaleCompletion
{
    public static function completeHeld(Sale $sale, User $user, ?string $method = null, ?float $received = null, string $logAction = 'resume'): Sale
    {
        return DB::transaction(function () use ($sale, $user, $method, $received, $logAction) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();

            if ($sale->status !== 'held') {
                throw ValidationException::withMessages([
                    'items' => ['Only held sales can be resumed.'],
                ]);
            }

            $sale->load('items');
            $variants = ProductVariant::withTrashed()
                ->whereIn('id', $sale->items->pluck('variant_id'))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $requestedByVariant = $sale->items->groupBy('variant_id')->map(fn ($rows) => Qty::round($rows->sum('quantity')));

            foreach ($requestedByVariant as $variantId => $requestedQty) {
                $variant = $variants[$variantId];
                if ($variant->product?->track_stock !== false && Qty::round($variant->stock_qty) < $requestedQty) {
                    throw ValidationException::withMessages([
                        'items' => ["Insufficient stock for {$variant->sku}. Available: ".Qty::format($variant->stock_qty).'.'],
                    ]);
                }
            }

            foreach ($sale->items as $i => $item) {
                $variant = $variants[$item->variant_id];
                SerialService::sell($variant, $item, $item->pending_serials ?? [], "items.{$i}.serials");
                BatchService::consumeForSale($variant, $item);
                StockService::decrement($variant, $item->quantity, 'out', $user, $sale, 'Resumed sale '.$sale->invoice_number);
                $item->update(['pending_serials' => null]);
            }

            $paymentReceived = $received ?? $sale->grand_total;
            $sale->payment_method = $method ?? $sale->payment_method;
            $sale->payment_received = $paymentReceived;
            $sale->change_amount = max(0, $paymentReceived - $sale->grand_total);
            $sale->paid_amount = min($sale->grand_total, $paymentReceived);
            $sale->status = 'completed';
            // paid when the rider is back with the money = delivered
            if ($sale->order_type === 'delivery' && $sale->delivery_status === 'out') {
                $sale->delivery_status = 'delivered';
                $sale->delivered_at = now();
            }
            $sale->syncPaymentStatus();
            $sale->save();

            IngredientService::consumeForSale($sale, $user);

            if ($sale->customer_id) {
                Customer::where('id', $sale->customer_id)->increment('total_purchases', $sale->grand_total);
                self::settleLoyalty($sale);
            }

            ActivityLogger::log($user, $logAction, 'sales', $logAction === 'resume'
                ? "Resumed held sale {$sale->invoice_number}."
                : "Delivered and paid {$sale->invoice_number}.");

            return $sale;
        });
    }

    /**
     * A sale just became completed (new or resumed held bill): take the
     * loyalty points the customer used and give the points they earned.
     * The delivery charge earns no points.
     */
    public static function settleLoyalty(Sale $sale): void
    {
        if (! $sale->customer_id) {
            return;
        }

        if ($sale->points_redeemed > 0) {
            $taken = Customer::whereKey($sale->customer_id)
                ->where('loyalty_points', '>=', $sale->points_redeemed)
                ->decrement('loyalty_points', $sale->points_redeemed);
            if (! $taken) {
                throw ValidationException::withMessages([
                    'points_redeemed' => ['This customer no longer has enough points.'],
                ]);
            }
        }

        $earned = SalePricing::pointsFor((float) $sale->grand_total - (float) $sale->delivery_fee);
        if ($earned > 0) {
            Customer::whereKey($sale->customer_id)->increment('loyalty_points', $earned);
        }
        if ($earned !== (int) $sale->points_earned) {
            $sale->points_earned = $earned;
            $sale->save();
        }
    }
}
