<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:products,slug'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],

            'images' => ['nullable', 'array'],
            'images.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'primary_image_index' => ['nullable', 'integer', 'min:0'],

            // Explicit variant mode.
            'variants' => ['required_without:colors', 'array', 'min:1'],
            'variants.*.color' => ['required_with:variants', 'string', 'max:100'],
            'variants.*.size' => ['required_with:variants', 'string', 'max:50'],
            'variants.*.purchase_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.selling_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.stock_qty' => ['required_with:variants', 'integer', 'min:0'],
            'variants.*.low_stock_threshold' => ['nullable', 'integer', 'min:0'],

            // Bulk cartesian mode (colors x sizes, shared pricing/stock).
            'colors' => ['required_without:variants', 'array', 'min:1'],
            'colors.*' => ['string', 'max:100'],
            'sizes' => ['required_with:colors', 'array', 'min:1'],
            'sizes.*' => ['string', 'max:50'],
            'purchase_price' => ['required_with:colors', 'numeric', 'min:0'],
            'selling_price' => ['required_with:colors', 'numeric', 'min:0'],
            'stock_qty' => ['required_with:colors', 'integer', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
