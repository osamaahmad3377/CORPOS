<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreStockAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'type' => ['required', 'string', 'in:in,out,damaged,count'],
            'quantity' => ['required_unless:type,count', 'numeric', 'gt:0', 'max:9999999'],
            'new_quantity' => ['required_if:type,count', 'numeric', 'min:0', 'max:9999999'],
            'reason' => ['nullable', 'string'],
            'serials' => ['nullable', 'array'],
            'serials.*' => ['string', 'max:100'],
            'batch_no' => ['nullable', 'string', 'max:100'],
            'expiry_date' => ['nullable', 'date'],
        ];
    }
}
