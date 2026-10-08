<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('products', 'slug')->ignore($this->route('product'))],
            'category_id' => ['sometimes', 'required', 'integer', 'exists:categories,id'],
            'brand_id' => ['sometimes', 'nullable', 'integer', 'exists:brands,id'],
            'description' => ['sometimes', 'nullable', 'string'],
            'unit' => ['sometimes', 'required', 'string', Rule::in(array_keys(config('pos.units')))],
            'track_serial' => ['sometimes', 'boolean'],
            'track_stock' => ['sometimes', 'boolean'],
            'track_expiry' => ['sometimes', 'boolean'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:240'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
