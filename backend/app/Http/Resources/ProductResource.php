<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => $this->category?->name),
            'section' => $this->section,
            'brand_id' => $this->brand_id,
            'brand' => $this->whenLoaded('brand', fn () => $this->brand?->name),
            'description' => $this->description,
            'unit' => $this->unit ?? 'pcs',
            'unit_label' => config('pos.units.'.($this->unit ?? 'pcs').'.label', $this->unit),
            'fractional' => \App\Support\Qty::unitIsFractional($this->unit ?? 'pcs'),
            'track_serial' => (bool) $this->track_serial,
            'track_stock' => $this->track_stock !== false,
            'track_expiry' => (bool) $this->track_expiry,
            'warranty_months' => $this->warranty_months,
            'is_active' => $this->is_active,
            'images' => ProductImageResource::collection($this->whenLoaded('images')),
            'variants' => ProductVariantResource::collection($this->whenLoaded('variants')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
