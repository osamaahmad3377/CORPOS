<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// Used for both create and update (update sends the full record too).
class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->category)) {
            $this->merge(['category' => trim(preg_replace('/\s+/', ' ', $this->category))]);
        }
    }

    public function rules(): array
    {
        return [
            'expense_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->addDay()->toDateString()],
            'category' => ['required', 'string', 'max:60'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999.99'],
            'payment_method' => ['required', 'string', Rule::in(array_keys(config('pos.payment_methods')))],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'amount.gt' => 'Amount must be more than zero.',
            'expense_date.before_or_equal' => 'The date cannot be in the future.',
        ];
    }
}
