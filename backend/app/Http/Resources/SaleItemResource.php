<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'variant_id' => $this->variant_id,
            'product_name' => $this->whenLoaded('variant', fn () => $this->variant?->product?->name),
            'color' => $this->whenLoaded('variant', fn () => $this->variant?->color),
            'size' => $this->whenLoaded('variant', fn () => $this->variant?->size),
            'sku' => $this->whenLoaded('variant', fn () => $this->variant?->sku),
            'unit' => $this->whenLoaded('variant', fn () => $this->variant?->product?->unit ?? 'pcs'),
            'warranty_months' => $this->whenLoaded('variant', fn () => $this->variant?->product?->warranty_months),
            // sold serials, or the ones chosen for a still-held bill
            'serials' => $this->pending_serials ?: $this->serialNumbers()->pluck('serial')->all(),
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'discount_per_item' => $this->discount_per_item,
            'total_price' => $this->total_price,
            // automatic offer on this line (already inside discount_per_item)
            'promotion_id' => $this->promotion_id,
            'promotion_name' => $this->promotion_id ? $this->promotion?->name : null,
            'promo_discount' => $this->promo_discount ?? '0.00',
        ];
    }
}
