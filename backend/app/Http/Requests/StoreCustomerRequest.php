<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:30', 'unique:customers,phone'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'price_level' => ['nullable', 'string', 'in:retail,wholesale'],
        ];
    }
}
