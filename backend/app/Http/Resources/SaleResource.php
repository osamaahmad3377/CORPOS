<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->invoice_number,
            'invoice_number' => $this->invoice_number,
            'customer_id' => $this->customer_id,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->name),
            'cashier_id' => $this->cashier_id,
            'cashier' => $this->whenLoaded('cashier', fn () => $this->cashier?->name),
            'sale_date' => $this->sale_date,
            'subtotal' => $this->subtotal,
            'discount_amount' => $this->discount_amount,
            'tax_amount' => $this->tax_amount,
            'grand_total' => $this->grand_total,
            'payment_method' => $this->payment_method,
            'payment_received' => $this->payment_received,
            'change_amount' => $this->change_amount,
            'paid_amount' => $this->paid_amount,
            'due_amount' => $this->due_amount,
            'refunded_amount' => $this->refunded_amount,
            'net_revenue' => $this->net_revenue,
            'status' => $this->status,
            'order_type' => $this->order_type,
            'table_no' => $this->table_no,
            'payment_status' => $this->payment_status,
            'notes' => $this->notes,
            'items_count' => $this->whenCounted('items'),
            'items' => SaleItemResource::collection($this->whenLoaded('items')),
            'returns' => SaleReturnResource::collection($this->whenLoaded('returns')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
