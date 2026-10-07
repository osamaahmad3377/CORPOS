<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductVariantsRequest;
use App\Http\Requests\UpdateProductVariantRequest;
use App\Http\Resources\ProductVariantResource;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\BarcodeGenerator;
use App\Services\SkuGenerator;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductVariantController extends Controller
{
    public function search(Request $request)
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:1'],
        ]);

        $term = $validated['q'];

        $variants = ProductVariant::with('product')
            ->where('is_active', true)
            ->where(function ($query) use ($term) {
                $query->where('sku', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhereHas('product', function ($q) use ($term) {
                        $q->where('name', 'like', "%{$term}%");
                    });
            })
            ->limit(20)
            ->get();

        return ProductVariantResource::collection($variants);
    }

    public function storeForProduct(StoreProductVariantsRequest $request, Product $product)
    {
        $validated = $request->validated();
        $user = $request->user();

        $variants = DB::transaction(function () use ($validated, $product, $user) {
            $created = [];

            foreach ($validated['colors'] as $color) {
                foreach ($validated['sizes'] as $size) {
                    $exists = ProductVariant::where('product_id', $product->id)
                        ->where('color', $color)
                        ->where('size', $size)
                        ->exists();

                    if ($exists) {
                        throw ValidationException::withMessages([
                            'colors' => ["A variant with color \"{$color}\" and size \"{$size}\" already exists for this product."],
                        ]);
                    }

                    $variant = ProductVariant::create([
                        'product_id' => $product->id,
                        'color' => $color,
                        'size' => $size,
                        'sku' => SkuGenerator::generate($product, $color, $size),
                        'barcode' => 'TMP-'.Str::random(10),
                        'purchase_price' => $validated['purchase_price'],
                        'selling_price' => $validated['selling_price'],
                        'stock_qty' => 0,
                        'low_stock_threshold' => $validated['low_stock_threshold'] ?? 5,
                    ]);

                    BarcodeGenerator::assignToVariant($product, $variant);

                    if ($validated['stock_qty'] > 0) {
                        StockService::increment($variant, $validated['stock_qty'], 'in', $user, null, 'Initial stock on variant creation');
                    }

                    $created[] = $variant;
                }
            }

            return $created;
        });

        return ProductVariantResource::collection(collect($variants)->map->fresh());
    }

    public function update(UpdateProductVariantRequest $request, ProductVariant $variant)
    {
        $variant->update($request->validated());

        return new ProductVariantResource($variant->fresh());
    }

    public function destroy(ProductVariant $variant)
    {
        // Soft-deleting a variant pulls it out of every inventory view —
        // any stock it's still carrying would silently disappear from
        // reports instead of being accounted for. Force a stock adjustment
        // to zero first so there's an audit trail for where it went.
        if ($variant->stock_qty > 0) {
            return response()->json([
                'message' => "This variant still has {$variant->stock_qty} unit(s) in stock. Zero it out via a stock adjustment before deleting it.",
            ], 422);
        }

        $variant->delete();

        return response()->json(['message' => 'Variant deleted successfully.']);
    }
}
