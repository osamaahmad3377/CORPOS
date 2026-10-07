<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseItemResource extends JsonResource
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
            ...(function () {
                $batch = \App\Models\ProductBatch::where('purchase_item_id', $this->id)->first();

                return ['batch_no' => $batch?->batch_no, 'expiry_date' => $batch?->expiry_date?->format('Y-m-d')];
            })(),
            'serials' => \App\Models\ProductSerial::where('purchase_id', $this->purchase_id)->where('variant_id', $this->variant_id)->pluck('serial')->all(),
            'serials_in_stock' => \App\Models\ProductSerial::where('purchase_id', $this->purchase_id)->where('variant_id', $this->variant_id)->where('status', 'in_stock')->pluck('serial')->all(),
            'track_serial' => (bool) $this->variant?->product?->track_serial,
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'total_price' => $this->total_price,
        ];
    }
}
