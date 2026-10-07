<?php

namespace App\Services;

use App\Models\ProductVariant;
use App\Models\StockAdjustment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class StockService
{
    /**
     * Increase stock by $quantity (positive integer) and record the movement.
     * Caller is responsible for any row locking within its own transaction.
     */
    public static function increment(ProductVariant $variant, int $quantity, string $type, ?User $user, ?Model $reference = null, ?string $reason = null): StockAdjustment
    {
        return self::move($variant, abs($quantity), $type, $user, $reference, $reason);
    }

    /**
     * Decrease stock by $quantity (positive integer) and record the movement.
     */
    public static function decrement(ProductVariant $variant, int $quantity, string $type, ?User $user, ?Model $reference = null, ?string $reason = null): StockAdjustment
    {
        return self::move($variant, -abs($quantity), $type, $user, $reference, $reason);
    }

    /**
     * Apply a raw signed delta (used for manual "count" reconciliation, where
     * the delta may be positive or negative depending on the counted value).
     */
    public static function adjust(ProductVariant $variant, int $delta, string $type, ?User $user, ?string $reason = null): StockAdjustment
    {
        return self::move($variant, $delta, $type, $user, null, $reason);
    }

    private static function move(ProductVariant $variant, int $delta, string $type, ?User $user, ?Model $reference, ?string $reason): StockAdjustment
    {
        $before = $variant->stock_qty;
        $after = $before + $delta;

        if ($after < 0) {
            throw ValidationException::withMessages([
                'quantity' => ["Stock for {$variant->sku} cannot go below zero (currently {$before})."],
            ]);
        }

        $variant->update(['stock_qty' => $after]);

        $adjustment = new StockAdjustment([
            'variant_id' => $variant->id,
            'adjustment_type' => $type,
            'quantity_before' => $before,
            'quantity_change' => $delta,
            'quantity_after' => $after,
            'reason' => $reason,
            'adjusted_by' => $user?->id,
        ]);

        if ($reference) {
            $adjustment->reference()->associate($reference);
        }

        $adjustment->save();

        return $adjustment;
    }
}
