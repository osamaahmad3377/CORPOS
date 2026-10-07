<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\Product;
use App\Models\ProductVariant;

class SkuGenerator
{
    public static function generate(Product $product, ?string $color, ?string $size): string
    {
        $brandCode = self::codeFrom($product->brand?->name, 'GEN', 3);
        $productCode = self::codeFrom($product->name, 'PRD', 3);
        $colorCode = self::codeFrom($color, 'STD', 3);
        $sizeCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $size ?? 'OS'));

        $base = "{$brandCode}-{$productCode}-{$colorCode}-{$sizeCode}";
        $sku = $base;
        $suffix = 1;

        while (ProductVariant::withTrashed()->where('sku', $sku)->exists()) {
            $suffix++;
            $sku = "{$base}-{$suffix}";
        }

        return $sku;
    }

    private static function codeFrom(?string $value, string $fallback, int $length): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value ?? ''));

        return $clean !== '' ? substr($clean, 0, $length) : $fallback;
    }
}
