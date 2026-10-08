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
            'kitchen_status' => $this->kitchen_status,
            'payment_status' => $this->payment_status,
            'notes' => $this->notes,
            'price_level' => $this->price_level ?? 'retail',
            'points_earned' => (int) $this->points_earned,
            'points_redeemed' => (int) $this->points_redeemed,
            'points_discount' => $this->points_discount ?? '0.00',
            'points_reversed' => (int) $this->points_reversed,
            'items_count' => $this->whenCounted('items'),
            'items' => SaleItemResource::collection($this->whenLoaded('items')),
            'returns' => SaleReturnResource::collection($this->whenLoaded('returns')),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id, 'amount' => $p->amount, 'payment_method' => $p->payment_method,
                'user' => $p->user?->name, 'created_at' => $p->created_at,
            ])),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
