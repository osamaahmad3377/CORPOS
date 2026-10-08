<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'unit' => ['nullable', 'string', Rule::in(array_keys(config('pos.units')))],
            'track_serial' => ['sometimes', 'boolean'],
            'track_stock' => ['sometimes', 'boolean'],
            'track_expiry' => ['sometimes', 'boolean'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:240'],
            'is_active' => ['sometimes', 'boolean'],

            'images' => ['nullable', 'array'],
            'images.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'primary_image_index' => ['nullable', 'integer', 'min:0'],

            // Explicit variant mode.
            'variants' => ['required_without:colors', 'array', 'min:1'],
            // Options are optional: a plain product (rice, a hammer) is a
            // single variant with neither set.
            'variants.*.color' => ['nullable', 'string', 'max:100'],
            'variants.*.size' => ['nullable', 'string', 'max:50'],
            // A barcode already printed on the item (scanned in) — otherwise
            // one is generated. Checked against the permanent barcode history.
            'variants.*.barcode' => ['nullable', 'string', 'max:50', 'distinct', 'unique:barcodes,barcode_number', 'unique:product_variants,barcode'],
            // Opening stock of a serial-tracked product: one serial per unit.
            'variants.*.serials' => ['nullable', 'array'],
            'variants.*.serials.*' => ['string', 'max:100'],
            // Opening stock of an expiry-tracked product.
            'variants.*.batch_no' => ['nullable', 'string', 'max:100'],
            'variants.*.expiry_date' => ['nullable', 'date'],
            'variants.*.purchase_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.selling_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.wholesale_price' => ['nullable', 'numeric', 'min:0'],
            'variants.*.stock_qty' => ['required_with:variants', 'numeric', 'min:0', 'max:9999999'],
            'variants.*.low_stock_threshold' => ['nullable', 'numeric', 'min:0', 'max:9999999'],

            // Bulk cartesian mode (colors x sizes, shared pricing/stock).
            'colors' => ['required_without:variants', 'array', 'min:1'],
            'colors.*' => ['string', 'max:100'],
            'sizes' => ['required_with:colors', 'array', 'min:1'],
            'sizes.*' => ['string', 'max:50'],
            'purchase_price' => ['required_with:colors', 'numeric', 'min:0'],
            'selling_price' => ['required_with:colors', 'numeric', 'min:0'],
            'wholesale_price' => ['nullable', 'numeric', 'min:0'],
            'stock_qty' => ['required_with:colors', 'numeric', 'min:0', 'max:9999999'],
            'low_stock_threshold' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
        ];
    }
}
