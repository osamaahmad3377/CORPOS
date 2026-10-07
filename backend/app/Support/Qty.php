<?php

namespace App\Support;

use App\Models\ProductVariant;
use Illuminate\Validation\ValidationException;

/**
 * Stock quantities are decimal(12,3): 1.5 kg of rice, 2.25 m of cable.
 * Always round through here before comparing, so float noise
 * (0.3 - 0.1 = 0.19999…) can't block a legitimate sale or return.
 */
class Qty
{
    public const PRECISION = 3;

    public static function round(float|int|string|null $qty): float
    {
        return round((float) $qty, self::PRECISION);
    }

    public static function isWhole(float|int|string $qty): bool
    {
        $q = self::round($qty);

        return abs($q - round($q)) < 0.0005;
    }

    public static function unitIsFractional(?string $unit): bool
    {
        return (bool) (config("pos.units.{$unit}.fractional") ?? false);
    }

    /** Products sold by the piece/pair/box must move in whole numbers. */
    public static function assertAllowed(ProductVariant $variant, float|int|string $qty, string $field = 'quantity'): void
    {
        $unit = $variant->product?->unit ?? 'pcs';

        if (! self::unitIsFractional($unit) && ! self::isWhole($qty)) {
            $label = config("pos.units.{$unit}.label", $unit);
            throw ValidationException::withMessages([
                $field => ["{$variant->sku} is sold per {$label} — quantity must be a whole number."],
            ]);
        }
    }

    /** 2.000 -> "2", 1.500 -> "1.5" for messages. */
    public static function format(float|int|string|null $qty): string
    {
        return rtrim(rtrim(number_format(self::round($qty), self::PRECISION, '.', ''), '0'), '.');
    }
}
