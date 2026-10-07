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
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'discount_per_item' => $this->discount_per_item,
            'total_price' => $this->total_price,
        ];
    }
}
