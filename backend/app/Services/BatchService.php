<?php

namespace App\Services;

use App\Models\ProductBatch;
use App\Models\ProductVariant;
use App\Models\SaleItem;
use App\Support\Qty;
use Illuminate\Support\Facades\DB;

/**
 * Batch / expiry tracking for products with track_expiry on.
 * Batches are a breakdown of the variant's stock; stock that arrived without
 * a batch (e.g. opening stock) simply isn't covered by one. Sales draw from
 * batches earliest-expiry-first (FEFO) and record the draw for returns.
 */
class BatchService
{
    public static function tracks(ProductVariant $variant): bool
    {
        return (bool) $variant->product?->track_expiry;
    }

    public static function receive(ProductVariant $variant, float $qty, ?string $batchNo, ?string $expiry, ?float $cost = null, ?int $purchaseItemId = null): ?ProductBatch
    {
        if (! self::tracks($variant) || ($batchNo === null && $expiry === null)) {
            return null;
        }
        $qty = Qty::round($qty);

        return ProductBatch::create([
            'variant_id' => $variant->id,
            'batch_no' => $batchNo,
            'expiry_date' => $expiry,
            'quantity' => $qty,
            'initial_quantity' => $qty,
            'cost_price' => $cost,
            'purchase_item_id' => $purchaseItemId,
        ]);
    }

    /** FEFO draw for a sale line. Any quantity beyond batched stock is un-batched stock. */
    public static function consumeForSale(ProductVariant $variant, SaleItem $item): void
    {
        if (! self::tracks($variant)) {
            return;
        }
        self::draw($variant, $item->quantity, function (ProductBatch $batch, float $take) use ($item) {
            DB::table('sale_item_batches')->insert([
                'sale_item_id' => $item->id, 'batch_id' => $batch->id, 'quantity' => $take,
                'quantity_returned' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
    }

    /** Stock leaving without a sale (return to supplier, damage): FEFO, or a named batch. */
    public static function consume(ProductVariant $variant, float $qty, ?int $batchId = null): void
    {
        if (! self::tracks($variant)) {
            return;
        }
        self::draw($variant, $qty, null, $batchId);
    }

    private static function draw(ProductVariant $variant, float $qty, ?callable $record, ?int $batchId = null): void
    {
        $remaining = Qty::round($qty);
        $batches = ProductBatch::where('variant_id', $variant->id)->where('quantity', '>', 0)
            ->when($batchId, fn ($q) => $q->where('id', $batchId))
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC, id ASC')
            ->lockForUpdate()->get();

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }
            $take = Qty::round(min($remaining, $batch->quantity));
            $batch->update(['quantity' => Qty::round($batch->quantity - $take)]);
            if ($record) {
                $record($batch, $take);
            }
            $remaining = Qty::round($remaining - $take);
        }
    }

    /** Customer return: put the quantity back into the batches the sale drew from (latest-expiry first). */
    public static function returnForSale(SaleItem $item, float $qty): void
    {
        $remaining = Qty::round($qty);
        $draws = DB::table('sale_item_batches')->where('sale_item_id', $item->id)->orderByDesc('id')->get();

        foreach ($draws as $draw) {
            if ($remaining <= 0) {
                break;
            }
            $open = Qty::round($draw->quantity - $draw->quantity_returned);
            $back = Qty::round(min($remaining, $open));
            if ($back <= 0) {
                continue;
            }
            DB::table('sale_item_batches')->where('id', $draw->id)->update(['quantity_returned' => Qty::round($draw->quantity_returned + $back)]);
            ProductBatch::whereKey($draw->batch_id)->increment('quantity', $back);
            $remaining = Qty::round($remaining - $back);
        }
    }

    public static function forSaleItems($itemIds)
    {
        return DB::table('sale_item_batches')
            ->join('product_batches', 'product_batches.id', '=', 'sale_item_batches.batch_id')
            ->whereIn('sale_item_id', $itemIds)
            ->get(['sale_item_id', 'batch_no', 'expiry_date', 'sale_item_batches.quantity'])
            ->groupBy('sale_item_id');
    }
}
