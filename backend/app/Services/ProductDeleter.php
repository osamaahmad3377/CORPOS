<?php

namespace App\Services;

use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Deleting an item.
 *
 * An item that was never sold, bought, returned or quoted is removed from
 * the database completely: its types, barcodes, batches, serials, photos
 * and stock history go with it.
 *
 * An item that appears on old bills or purchases can't be removed — those
 * bills must still open and add up — so it is taken out of the shop
 * instead: stock left is written off (recorded), its barcodes are freed for
 * new items, and it is hidden everywhere (soft-deleted).
 */
class ProductDeleter
{
    /** Records that must keep pointing at the item. */
    private const HISTORY = ['sale_items', 'purchase_items', 'sale_return_items', 'purchase_return_items', 'quotation_items'];

    /** @return string 'removed' (gone from the database) or 'archived' (kept for old bills) */
    public static function delete(Product $product, ?User $user): string
    {
        $images = [];

        $result = DB::transaction(function () use ($product, $user, &$images) {
            $variantIds = $product->variants()->withTrashed()->pluck('id');

            if (! self::usedInHistory($variantIds)) {
                $images = $product->images()->pluck('image_path')->all();
                DB::table('stock_adjustments')->whereIn('variant_id', $variantIds)->delete();
                // types, barcodes, batches, serials, photos and recipes go
                // with it (cascade)
                $product->forceDelete();

                return 'removed';
            }

            foreach ($product->variants()->get() as $variant) {
                if ($product->track_stock !== false && $variant->stock_qty > 0) {
                    BatchService::consume($variant, (float) $variant->stock_qty);
                    StockService::adjust($variant, -$variant->stock_qty, 'adjustment', $user, 'Item deleted');
                }
                $variant->releaseBarcode();
            }
            $product->variants()->update(['is_active' => false]);
            $product->variants()->delete();
            $product->delete();

            return 'archived';
        });

        foreach ($images as $path) {
            Storage::disk('public')->delete($path);
        }

        return $result;
    }

    private static function usedInHistory($variantIds): bool
    {
        foreach (self::HISTORY as $table) {
            if (Schema::hasTable($table) && DB::table($table)->whereIn('variant_id', $variantIds)->exists()) {
                return true;
            }
        }

        return false;
    }
}
