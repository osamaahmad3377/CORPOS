<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductVariantResource;
use App\Models\Barcode;
use App\Models\ProductVariant;
use App\Services\BarcodeGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BarcodeController extends Controller
{
    public function generate(ProductVariant $variant)
    {
        $variant->load('product');

        BarcodeGenerator::assignToVariant($variant->product, $variant);

        return new ProductVariantResource($variant->fresh());
    }

    public function assign(Request $request, ProductVariant $variant)
    {
        // Uniqueness is checked against the permanent `barcodes` history
        // table, not the live product_variants.barcode column — a code a
        // variant used to have (then moved away from) is still reserved
        // there, so re-handing it to a different variant would otherwise
        // pass validation and then crash on the table's unique constraint.
        $validated = $request->validate([
            'barcode_number' => [
                'required', 'string', 'max:50',
                Rule::unique('barcodes', 'barcode_number')->ignore($variant->id, 'variant_id'),
            ],
        ]);

        DB::transaction(function () use ($validated, $variant) {
            $variant->update(['barcode' => $validated['barcode_number']]);

            if (! Barcode::where('barcode_number', $validated['barcode_number'])->where('variant_id', $variant->id)->exists()) {
                Barcode::create([
                    'variant_id' => $variant->id,
                    'barcode_number' => $validated['barcode_number'],
                    'barcode_type' => 'code128',
                    'is_custom' => true,
                ]);
            }
        });

        return new ProductVariantResource($variant->fresh());
    }

    public function check(string $code)
    {
        return response()->json([
            'exists' => ProductVariant::withTrashed()->where('barcode', $code)->exists(),
        ]);
    }

    public function scan(string $code)
    {
        $variant = ProductVariant::where('barcode', $code)->with('product')->first();

        if (! $variant) {
            return response()->json(['message' => 'Barcode not found.'], 404);
        }

        return response()->json([
            'variant' => new ProductVariantResource($variant),
            'product' => [
                'id' => $variant->product->id,
                'name' => $variant->product->name,
            ],
        ]);
    }

    public function print(Request $request)
    {
        $validated = $request->validate([
            'variant_ids' => ['required', 'array', 'min:1'],
            'variant_ids.*' => ['integer', 'exists:product_variants,id'],
        ]);

        $variants = ProductVariant::with('product')
            ->whereIn('id', $validated['variant_ids'])
            ->get();

        return response()->json([
            'labels' => $variants->map(fn (ProductVariant $variant) => [
                'barcode' => $variant->barcode,
                'sku' => $variant->sku,
                'product_name' => $variant->product->name,
                'variant' => trim("{$variant->color} / {$variant->size}", ' /'),
                'price' => $variant->selling_price,
            ]),
        ]);
    }
}
