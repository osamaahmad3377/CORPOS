<?php

namespace App\Services;

use App\Models\Barcode;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;

class BarcodeGenerator
{
    /**
     * 12-digit format: [Year(2)][CategoryID(2)][ProductID(4)][VariantID(4)].
     * VariantID is not known until the variant row exists, so this must be
     * called AFTER the variant has been created and saved.
     *
     * Collisions are checked against the `barcodes` history table (not just
     * the live product_variants.barcode column) because old codes stay
     * permanently reserved there even after a variant's barcode changes —
     * checking the live column only lets a stale historical code be handed
     * out again, which then dies on the table's unique constraint.
     */
    public static function generate(Product $product, ProductVariant $variant): string
    {
        $year = date('y');
        $categoryId = str_pad((string) ($product->category_id % 100), 2, '0', STR_PAD_LEFT);
        $productId = str_pad((string) ($product->id % 10000), 4, '0', STR_PAD_LEFT);
        $variantId = str_pad((string) ($variant->id % 10000), 4, '0', STR_PAD_LEFT);

        $code = "{$year}{$categoryId}{$productId}{$variantId}";

        $attempt = 0;
        while (Barcode::where('barcode_number', $code)->where('variant_id', '!=', $variant->id)->exists()) {
            $attempt++;
            $code = substr($code, 0, 8).str_pad((string) (((int) substr($code, 8) + $attempt) % 10000), 4, '0', STR_PAD_LEFT);
        }

        return $code;
    }

    public static function assignToVariant(Product $product, ProductVariant $variant): ProductVariant
    {
        return DB::transaction(function () use ($product, $variant) {
            $code = self::generate($product, $variant);

            // Idempotent: this variant already holds this exact code (e.g.
            // "Generate Barcode" clicked twice) — nothing to do.
            $alreadyRecorded = Barcode::where('barcode_number', $code)->where('variant_id', $variant->id)->exists();
            if ($variant->barcode === $code && $alreadyRecorded) {
                return $variant;
            }

            $variant->update(['barcode' => $code]);

            if (! $alreadyRecorded) {
                Barcode::create([
                    'variant_id' => $variant->id,
                    'barcode_number' => $code,
                    'barcode_type' => 'code128',
                    'is_custom' => false,
                ]);
            }

            return $variant;
        });
    }

    /** Use a code that's already on the item (scanned from its packaging). */
    public static function assignCustom(ProductVariant $variant, string $code): ProductVariant
    {
        return DB::transaction(function () use ($variant, $code) {
            $variant->update(['barcode' => $code]);

            if (! Barcode::where('barcode_number', $code)->where('variant_id', $variant->id)->exists()) {
                Barcode::create([
                    'variant_id' => $variant->id,
                    'barcode_number' => $code,
                    'barcode_type' => preg_match('/^\d{13}$/', $code) ? 'ean13' : 'code128',
                    'is_custom' => true,
                ]);
            }

            return $variant;
        });
    }
}
