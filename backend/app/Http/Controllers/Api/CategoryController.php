<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCategoryRequest;
use App\Http\Requests\UpdateCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    public function index()
    {
        return CategoryResource::collection(
            Category::with('parent')->withCount('products')->orderBy('name')->get()
        );
    }

    public function store(StoreCategoryRequest $request)
    {
        $validated = $request->validated();
        $validated['slug'] = $validated['slug'] ?? $this->uniqueSlug($validated['name']);

        $category = Category::create($validated)->refresh();

        return new CategoryResource($category);
    }

    public function show(Category $category)
    {
        return new CategoryResource($category->load('parent'));
    }

    public function update(UpdateCategoryRequest $request, Category $category)
    {
        $validated = $request->validated();

        if (array_key_exists('name', $validated) && empty($validated['slug'] ?? null)) {
            $validated['slug'] = $this->uniqueSlug($validated['name'], $category->id);
        }

        $category->update($validated);

        return new CategoryResource($category);
    }

    private function uniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $suffix = 1;

        while (Category::withTrashed()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $suffix++;
            $slug = "{$base}-{$suffix}";
        }

        return $slug;
    }

    public function destroy(Category $category)
    {
        if (Product::where('category_id', $category->id)->exists()) {
            return response()->json([
                'message' => 'This category cannot be deleted because it has products assigned to it.',
            ], 422);
        }

        if (Category::where('parent_id', $category->id)->exists()) {
            return response()->json([
                'message' => 'This category cannot be deleted because it has sub-categories.',
            ], 422);
        }

        $category->delete();

        return response()->json(['message' => 'Category deleted successfully.']);
    }
}
