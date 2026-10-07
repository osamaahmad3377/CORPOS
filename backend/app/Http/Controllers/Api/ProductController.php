<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Services\BarcodeGenerator;
use App\Services\SkuGenerator;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::with(['category', 'brand', 'images', 'variants']);

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        if ($request->filled('brand_id')) {
            $query->where('brand_id', $request->integer('brand_id'));
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where('name', 'like', "%{$search}%");
        }

        $products = $query->orderByDesc('id')->paginate($request->integer('per_page', 20));

        return ProductResource::collection($products);
    }

    public function store(StoreProductRequest $request)
    {
        $validated = $request->validated();

        $product = DB::transaction(function () use ($request, $validated) {
            $product = Product::create([
                'name' => $validated['name'],
                'slug' => $validated['slug'] ?? $this->uniqueSlug($validated['name']),
                'category_id' => $validated['category_id'],
                'brand_id' => $validated['brand_id'] ?? null,
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            $this->storeImages($request, $product);
            $this->storeVariants($product, $validated, $request->user());

            return $product;
        });

        return new ProductResource($product->load(['category', 'brand', 'images', 'variants']));
    }

    public function show(Product $product)
    {
        return new ProductResource($product->load(['category', 'brand', 'images', 'variants']));
    }

    public function update(UpdateProductRequest $request, Product $product)
    {
        $validated = $request->validated();

        if (array_key_exists('name', $validated) && empty($validated['slug'] ?? null)) {
            $validated['slug'] = $this->uniqueSlug($validated['name'], $product->id);
        }

        $product->update($validated);

        return new ProductResource($product->load(['category', 'brand', 'images', 'variants']));
    }

    public function destroy(Product $product)
    {
        // Same reasoning as variant deletion — soft-deleting drops every
        // variant out of inventory views, so any remaining stock would
        // silently vanish from reports instead of being accounted for.
        $stockRemaining = $product->variants()->sum('stock_qty');
        if ($stockRemaining > 0) {
            return response()->json([
                'message' => "This product still has {$stockRemaining} unit(s) in stock across its variants. Zero them out via stock adjustments before deleting it.",
            ], 422);
        }

        DB::transaction(function () use ($product) {
            // Deleting a product must also pull its variants out of the
            // sellable catalog — otherwise they stay scannable/searchable
            // at the POS terminal even though the product is "gone".
            $product->variants()->update(['is_active' => false]);
            $product->variants()->delete();
            $product->delete();
        });

        return response()->json(['message' => 'Product deleted successfully.']);
    }

    public function updateImage(Request $request, Product $product)
    {
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        foreach ($product->images as $existing) {
            Storage::disk('public')->delete($existing->image_path);
            $existing->delete();
        }

        $path = $validated['image']->store('products', 'public');

        ProductImage::create([
            'product_id' => $product->id,
            'image_path' => $path,
            'is_primary' => true,
            'sort_order' => 0,
        ]);

        return new ProductResource($product->load(['category', 'brand', 'images', 'variants']));
    }

    private function uniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 1;

        while (Product::withTrashed()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $suffix++;
            $slug = "{$base}-{$suffix}";
        }

        return $slug;
    }

    private function storeImages(Request $request, Product $product): void
    {
        $files = $request->file('images', []);

        if (empty($files)) {
            return;
        }

        $primaryIndex = $request->integer('primary_image_index', 0);

        foreach ($files as $index => $file) {
            $path = $file->store('products', 'public');

            ProductImage::create([
                'product_id' => $product->id,
                'image_path' => $path,
                'is_primary' => $index === $primaryIndex,
                'sort_order' => $index,
            ]);
        }

        if (! $product->images()->where('is_primary', true)->exists()) {
            $product->images()->orderBy('sort_order')->first()?->update(['is_primary' => true]);
        }
    }

    private function storeVariants(Product $product, array $validated, $user): void
    {
        $specs = [];

        if (! empty($validated['variants'])) {
            foreach ($validated['variants'] as $variant) {
                $specs[] = [
                    'color' => $variant['color'],
                    'size' => $variant['size'],
                    'purchase_price' => $variant['purchase_price'],
                    'selling_price' => $variant['selling_price'],
                    'stock_qty' => $variant['stock_qty'],
                    'low_stock_threshold' => $variant['low_stock_threshold'] ?? 5,
                ];
            }
        } else {
            foreach ($validated['colors'] as $color) {
                foreach ($validated['sizes'] as $size) {
                    $specs[] = [
                        'color' => $color,
                        'size' => $size,
                        'purchase_price' => $validated['purchase_price'],
                        'selling_price' => $validated['selling_price'],
                        'stock_qty' => $validated['stock_qty'],
                        'low_stock_threshold' => $validated['low_stock_threshold'] ?? 5,
                    ];
                }
            }
        }

        $seen = [];
        foreach ($specs as $spec) {
            $comboKey = mb_strtolower($spec['color']).'|'.mb_strtolower($spec['size']);
            if (isset($seen[$comboKey])) {
                throw ValidationException::withMessages([
                    'colors' => ["Duplicate color/size combination: \"{$spec['color']} / {$spec['size']}\"."],
                ]);
            }
            $seen[$comboKey] = true;
        }

        foreach ($specs as $spec) {
            $variant = ProductVariant::create([
                'product_id' => $product->id,
                'color' => $spec['color'],
                'size' => $spec['size'],
                'sku' => SkuGenerator::generate($product, $spec['color'], $spec['size']),
                'barcode' => 'TMP-'.Str::random(10),
                'purchase_price' => $spec['purchase_price'],
                'selling_price' => $spec['selling_price'],
                'stock_qty' => 0,
                'low_stock_threshold' => $spec['low_stock_threshold'],
            ]);

            BarcodeGenerator::assignToVariant($product, $variant);

            if ($spec['stock_qty'] > 0) {
                StockService::increment($variant, $spec['stock_qty'], 'in', $user, null, 'Initial stock on variant creation');
            }
        }
    }
}
