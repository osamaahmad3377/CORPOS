<?php

namespace App\Http\Requests;

/**
 * POST /sales/preview takes the same body as POST /sales, but the POS asks
 * before payment, so the payment method and client prices may be missing.
 */
class PreviewSaleRequest extends StoreSaleRequest
{
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['payment_method'] = ['nullable', 'string'];
        $rules['items.*.unit_price'] = ['nullable', 'numeric', 'min:0'];

        return $rules;
    }
}
