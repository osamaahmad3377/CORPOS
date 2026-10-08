<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductVariantsRequest;
use App\Http\Requests\UpdateProductVariantRequest;
use App\Http\Resources\ProductVariantResource;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\BarcodeGenerator;
use App\Services\BatchService;
use App\Services\SerialService;
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
                    ->orWhere('color', 'like', "%{$term}%")
                    ->orWhere('size', 'like', "%{$term}%")
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

        $specs = [];
        if (! empty($validated['variants'])) {
            foreach ($validated['variants'] as $v) {
                $specs[] = [
                    'color' => trim((string) ($v['color'] ?? '')) ?: null,
                    'size' => trim((string) ($v['size'] ?? '')) ?: null,
                    'barcode' => trim((string) ($v['barcode'] ?? '')) ?: null,
                    'serials' => $v['serials'] ?? [],
                    'batch_no' => trim((string) ($v['batch_no'] ?? '')) ?: null,
                    'expiry_date' => $v['expiry_date'] ?? null,
                    'purchase_price' => $v['purchase_price'],
                    'selling_price' => $v['selling_price'],
                    'wholesale_price' => $v['wholesale_price'] ?? null,
                    'stock_qty' => $v['stock_qty'],
                    'low_stock_threshold' => $v['low_stock_threshold'] ?? 5,
                ];
            }
        } else {
            foreach ($validated['colors'] as $color) {
                foreach ($validated['sizes'] as $size) {
                    $specs[] = [
                        'color' => $color,
                        'size' => $size,
                        'barcode' => null,
                        'serials' => [],
                        'batch_no' => null,
                        'expiry_date' => null,
                        'purchase_price' => $validated['purchase_price'],
                        'selling_price' => $validated['selling_price'],
                        'wholesale_price' => $validated['wholesale_price'] ?? null,
                        'stock_qty' => $validated['stock_qty'],
                        'low_stock_threshold' => $validated['low_stock_threshold'] ?? 5,
                    ];
                }
            }
        }

        $variants = DB::transaction(function () use ($specs, $product, $user) {
            $created = [];

            foreach ($specs as $i => $spec) {
                $exists = ProductVariant::where('product_id', $product->id)
                    ->where(fn ($q) => $spec['color'] === null ? $q->whereNull('color') : $q->where('color', $spec['color']))
                    ->where(fn ($q) => $spec['size'] === null ? $q->whereNull('size') : $q->where('size', $spec['size']))
                    ->exists();

                if ($exists) {
                    $label = trim(($spec['color'] ?? '').' / '.($spec['size'] ?? ''), ' /') ?: 'no options';
                    throw ValidationException::withMessages([
                        'variants' => ["This product already has a variant with \"{$label}\"."],
                    ]);
                }

                $variant = ProductVariant::create([
                    'product_id' => $product->id,
                    'color' => $spec['color'],
                    'size' => $spec['size'],
                    'sku' => SkuGenerator::generate($product, $spec['color'], $spec['size']),
                    'barcode' => 'TMP-'.Str::random(10),
                    'purchase_price' => $spec['purchase_price'],
                    'selling_price' => $spec['selling_price'],
                    'wholesale_price' => $spec['wholesale_price'],
                    'stock_qty' => 0,
                    'low_stock_threshold' => $spec['low_stock_threshold'],
                ]);

                if ($spec['barcode']) {
                    BarcodeGenerator::assignCustom($variant, $spec['barcode']);
                } else {
                    BarcodeGenerator::assignToVariant($product, $variant);
                }

                if ($spec['stock_qty'] > 0) {
                    $variant->setRelation('product', $product);
                    SerialService::receive($variant, SerialService::clean($spec['serials'], "variants.{$i}.serials"), (float) $spec['stock_qty'], "variants.{$i}.serials");
                    BatchService::receive($variant, (float) $spec['stock_qty'], $spec['batch_no'], $spec['expiry_date'], (float) $spec['purchase_price']);
                    StockService::increment($variant, $spec['stock_qty'], 'in', $user, null, 'Initial stock on variant creation');
                }

                $created[] = $variant;
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
