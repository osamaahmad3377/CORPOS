<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuotationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $customer = $this->relationLoaded('customer') ? $this->customer : null;

        return [
            'id' => $this->id,
            'quote_number' => $this->quote_number,
            'customer_id' => $this->customer_id,
            // saved customer's details win; otherwise the walk-in name/phone typed in
            'customer_name' => $customer?->name ?? $this->customer_name,
            'customer_phone' => $customer?->phone ?? $this->customer_phone,
            'valid_until' => $this->valid_until?->toDateString(),
            'subtotal' => $this->subtotal,
            'discount_amount' => $this->discount_amount,
            'tax_amount' => $this->tax_amount,
            'grand_total' => $this->grand_total,
            'notes' => $this->notes,
            'status' => $this->effective_status,
            'is_expired' => $this->effective_status === 'expired',
            'converted_sale_id' => $this->converted_sale_id,
            'converted_invoice_number' => $this->whenLoaded('convertedSale', fn () => $this->convertedSale?->invoice_number),
            'converted_at' => $this->converted_at,
            'created_by' => $this->created_by,
            'creator' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'items_count' => $this->whenCounted('items'),
            'items' => QuotationItemResource::collection($this->whenLoaded('items')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
