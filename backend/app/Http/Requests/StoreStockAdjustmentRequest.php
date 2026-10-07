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
            'quantity' => ['required_unless:type,count', 'integer', 'min:1'],
            'new_quantity' => ['required_if:type,count', 'integer', 'min:0'],
            'reason' => ['nullable', 'string'],
        ];
    }
}
