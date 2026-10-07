<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->po_number,
            'po_number' => $this->po_number,
            'invoice_number' => $this->invoice_number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->name),
            'purchase_date' => $this->purchase_date,
            'total_amount' => $this->total_amount,
            'discount' => $this->discount,
            'grand_total' => $this->grand_total,
            'paid_amount' => $this->paid_amount,
            'due_amount' => $this->due_amount,
            'refunded_amount' => $this->refunded_amount,
            'payment_status' => $this->payment_status,
            'notes' => $this->notes,
            'created_by' => $this->created_by,
            'creator' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'items_count' => $this->whenCounted('items'),
            'items' => PurchaseItemResource::collection($this->whenLoaded('items')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
