<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** "Price type" left empty means normal (retail) prices. */
    protected function prepareForValidation(): void
    {
        if ($this->has('price_level') && ! $this->input('price_level')) {
            $this->merge(['price_level' => 'retail']);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['sometimes', 'required', 'string', 'max:30', Rule::unique('customers', 'phone')->ignore($this->route('customer'))],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string'],
            'city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'price_level' => ['sometimes', 'nullable', 'string', 'in:retail,wholesale'],
        ];
    }
}
