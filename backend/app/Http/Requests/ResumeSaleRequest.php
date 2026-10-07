<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ResumeSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'payment_method' => ['nullable', 'string', Rule::in(array_keys(config('pos.payment_methods')))],
            'payment_received' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
