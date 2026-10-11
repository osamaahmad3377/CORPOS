<?php

namespace App\Services;

use App\Models\Barcode;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;

class BarcodeGenerator
{
    /**
     * A random 13-digit EAN-13 for items that came without a barcode:
     * "20" + 10 random digits + check digit. Codes starting with 2 are the
     * GS1 in-store range, so they never clash with a manufacturer's barcode
     * on a packet, and every scanner reads them.
     *
     * Collisions are checked against the `barcodes` history table (not just
     * the live product_variants.barcode column) because old codes stay
     * permanently reserved there even after a variant's barcode changes.
     */
    public static function generate(?Product $product = null, ?ProductVariant $variant = null): string
    {
        do {
            $body = '20';
            for ($i = 0; $i < 10; $i++) {
                $body .= random_int(0, 9);
            }
            $code = $body.self::ean13CheckDigit($body);
        } while (
            Barcode::where('barcode_number', $code)->exists()
            || ProductVariant::withTrashed()->where('barcode', $code)->exists()
        );

        return $code;
    }

    public static function ean13CheckDigit(string $twelve): int
    {
        $sum = 0;
        foreach (str_split($twelve) as $i => $d) {
            $sum += (int) $d * ($i % 2 ? 3 : 1);
        }

        return (10 - $sum % 10) % 10;
    }

    public static function assignToVariant(Product $product, ProductVariant $variant): ProductVariant
    {
        return DB::transaction(function () use ($product, $variant) {
            // Idempotent: a variant that already has a real barcode keeps it
            // (e.g. "Generate Barcode" clicked twice) — printed stickers stay valid.
            if ($variant->barcode && ! str_starts_with($variant->barcode, 'TMP-')) {
                return $variant;
            }

            $code = self::generate($product, $variant);
            $variant->update(['barcode' => $code]);

            if (! Barcode::where('barcode_number', $code)->where('variant_id', $variant->id)->exists()) {
                Barcode::create([
                    'variant_id' => $variant->id,
                    'barcode_number' => $code,
                    'barcode_type' => 'ean13',
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
