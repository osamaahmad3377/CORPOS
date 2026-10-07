<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductVariantsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Explicit list (options optional, barcode may be scanned in)…
            'variants' => ['required_without:colors', 'array', 'min:1'],
            'variants.*.color' => ['nullable', 'string', 'max:100'],
            'variants.*.size' => ['nullable', 'string', 'max:50'],
            'variants.*.barcode' => ['nullable', 'string', 'max:50', 'distinct', 'unique:barcodes,barcode_number', 'unique:product_variants,barcode'],
            'variants.*.purchase_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.selling_price' => ['required_with:variants', 'numeric', 'min:0'],
            'variants.*.stock_qty' => ['required_with:variants', 'numeric', 'min:0', 'max:9999999'],
            'variants.*.low_stock_threshold' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'variants.*.serials' => ['nullable', 'array'],
            'variants.*.serials.*' => ['string', 'max:100'],
            'variants.*.batch_no' => ['nullable', 'string', 'max:100'],
            'variants.*.expiry_date' => ['nullable', 'date'],
            // …or a colors x sizes grid with shared pricing.
            'colors' => ['required_without:variants', 'array', 'min:1'],
            'colors.*' => ['string', 'max:100'],
            'sizes' => ['required_with:colors', 'array', 'min:1'],
            'sizes.*' => ['string', 'max:50'],
            'purchase_price' => ['required_with:colors', 'numeric', 'min:0'],
            'selling_price' => ['required_with:colors', 'numeric', 'min:0'],
            'stock_qty' => ['required_with:colors', 'numeric', 'min:0', 'max:9999999'],
            'low_stock_threshold' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
        ];
    }
}
