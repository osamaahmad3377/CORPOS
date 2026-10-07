<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBrandRequest;
use App\Http\Requests\UpdateBrandRequest;
use App\Http\Resources\BrandResource;
use App\Models\Brand;
use Illuminate\Support\Str;

class BrandController extends Controller
{
    public function index()
    {
        return BrandResource::collection(Brand::withCount('products')->orderBy('name')->get());
    }

    public function store(StoreBrandRequest $request)
    {
        $validated = $request->validated();
        $validated['slug'] = $validated['slug'] ?? $this->uniqueSlug($validated['name']);

        $brand = Brand::create($validated)->refresh();

        return new BrandResource($brand);
    }

    public function show(Brand $brand)
    {
        return new BrandResource($brand);
    }

    public function update(UpdateBrandRequest $request, Brand $brand)
    {
        $validated = $request->validated();

        if (array_key_exists('name', $validated) && empty($validated['slug'] ?? null)) {
            $validated['slug'] = $this->uniqueSlug($validated['name'], $brand->id);
        }

        $brand->update($validated);

        return new BrandResource($brand);
    }

    private function uniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 1;

        while (Brand::withTrashed()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $suffix++;
            $slug = "{$base}-{$suffix}";
        }

        return $slug;
    }

    public function destroy(Brand $brand)
    {
        if ($brand->products()->exists()) {
            return response()->json([
                'message' => 'This brand cannot be deleted because it has products assigned to it.',
            ], 422);
        }

        $brand->delete();

        return response()->json(['message' => 'Brand deleted successfully.']);
    }
}
