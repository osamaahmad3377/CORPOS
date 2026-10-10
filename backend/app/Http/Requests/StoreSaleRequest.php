<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:9999999'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.discount_per_item' => ['nullable', 'numeric', 'min:0'],
            // serial/IMEI-tracked products: one serial per unit sold
            'items.*.serials' => ['nullable', 'array'],
            'items.*.serials.*' => ['string', 'max:100'],
            // restaurant mode
            'order_type' => ['nullable', 'string', 'in:dine_in,takeaway,delivery'],
            'table_no' => ['nullable', 'string', 'max:20'],
            'waiter_id' => ['nullable', 'integer', 'exists:waiters,id'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['required', 'string', Rule::in(array_keys(config('pos.payment_methods')))],
            'payment_received' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:completed,held'],
            'notes' => ['nullable', 'string'],
            'idempotency_key' => ['nullable', 'string', 'max:64'],
            // wholesale / retail prices — default: the customer's price type, else retail
            'price_level' => ['nullable', 'string', 'in:retail,wholesale'],
            // loyalty points the customer uses as money off this bill
            'points_redeemed' => ['nullable', 'integer', 'min:0', 'max:100000000'],
        ];
    }
}
