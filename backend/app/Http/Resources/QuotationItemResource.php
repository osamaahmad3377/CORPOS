<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuotationItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variant = $this->relationLoaded('variant') ? $this->variant : null;

        return [
            'id' => $this->id,
            'variant_id' => $this->variant_id,
            'product_name' => $variant?->product?->name,
            'color' => $variant?->color,
            'size' => $variant?->size,
            'sku' => $variant?->sku,
            'barcode' => $variant?->barcode,
            'unit' => $variant?->product?->unit ?? 'pcs',
            'track_serial' => (bool) $variant?->product?->track_serial,
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'discount_per_item' => $this->discount_per_item,
            'total_price' => $this->total_price,
            // live catalog info, so the POS can warn when loading an old quote
            'current_price' => $variant?->selling_price,
            'stock_qty' => $variant?->stock_qty,
            'is_available' => (bool) ($variant && ! $variant->trashed() && $variant->is_active && $variant->product && ! $variant->product->trashed()),
        ];
    }
}
