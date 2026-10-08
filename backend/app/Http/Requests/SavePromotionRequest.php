<?php

namespace App\Http\Requests;

use App\Models\Promotion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SavePromotionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(Promotion::TYPES)],
            'value' => ['exclude_if:type,buy_x_get_y', 'required', 'numeric', 'gt:0', 'max:9999999', Rule::when($this->input('type') === 'percent', ['max:100'])],
            'buy_qty' => ['exclude_unless:type,buy_x_get_y', 'required', 'integer', 'min:1', 'max:10000'],
            'get_qty' => ['exclude_unless:type,buy_x_get_y', 'required', 'integer', 'min:1', 'max:10000'],
            'applies_to' => ['required', Rule::in(Promotion::APPLIES_TO)],
            'category_id' => ['exclude_unless:applies_to,category', 'required', 'integer', 'exists:categories,id'],
            'product_id' => ['exclude_unless:applies_to,product', 'required', 'integer', 'exists:products,id'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'value.max' => 'A percent offer cannot be more than 100%.',
            'ends_at.after_or_equal' => 'The end date must be on or after the start date.',
            'category_id.required' => 'Choose the category.',
            'product_id.required' => 'Choose the item.',
            'buy_qty.required' => 'Write how many the customer must buy.',
            'get_qty.required' => 'Write how many the customer gets free.',
            'value.required' => 'Write how much the discount is.',
        ];
    }

    /** Normalised column values (unused fields cleared). */
    public function promotionData(): array
    {
        $v = $this->validated();

        return [
            'name' => trim($v['name']),
            'type' => $v['type'],
            'value' => $v['type'] === 'buy_x_get_y' ? 0 : $v['value'],
            'buy_qty' => $v['type'] === 'buy_x_get_y' ? $v['buy_qty'] : null,
            'get_qty' => $v['type'] === 'buy_x_get_y' ? $v['get_qty'] : null,
            'applies_to' => $v['applies_to'],
            'category_id' => $v['applies_to'] === 'category' ? $v['category_id'] : null,
            'product_id' => $v['applies_to'] === 'product' ? $v['product_id'] : null,
            'starts_at' => $v['starts_at'] ?? null,
            'ends_at' => $v['ends_at'] ?? null,
            'is_active' => $v['is_active'] ?? true,
        ];
    }
}
