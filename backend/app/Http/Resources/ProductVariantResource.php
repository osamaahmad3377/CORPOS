<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductVariantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'product_name' => $this->whenLoaded('product', fn () => $this->product?->name),
            'unit' => $this->whenLoaded('product', fn () => $this->product?->unit ?? 'pcs'),
            'track_serial' => $this->whenLoaded('product', fn () => (bool) $this->product?->track_serial),
            'track_expiry' => $this->whenLoaded('product', fn () => (bool) $this->product?->track_expiry),
            'color' => $this->color,
            'size' => $this->size,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            // Cost price is business-confidential — only staff trusted with
            // purchasing/margin data should see it, not every cashier who
            // can search, scan, or browse products at the POS.
            'purchase_price' => $this->when(
                $request->user()?->hasPermission('purchases.view'),
                $this->purchase_price
            ),
            'selling_price' => $this->selling_price,
            'wholesale_price' => $this->wholesale_price,
            'stock_qty' => $this->stock_qty,
            'low_stock_threshold' => $this->low_stock_threshold,
            'is_low_stock' => $this->is_low_stock,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
