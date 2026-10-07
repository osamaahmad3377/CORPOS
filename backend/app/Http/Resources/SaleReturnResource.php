<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleReturnResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sale_id' => $this->sale_id,
            'invoice_number' => $this->whenLoaded('sale', fn () => $this->sale?->invoice_number),
            'return_date' => $this->return_date,
            'reason' => $this->reason,
            'total_refund' => $this->total_refund,
            'processed_by' => $this->processed_by,
            'processor' => $this->whenLoaded('processor', fn () => $this->processor?->name),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'sale_item_id' => $item->sale_item_id,
                'variant_id' => $item->variant_id,
                'quantity_returned' => $item->quantity_returned,
                'refund_amount' => $item->refund_amount,
            ])),
            'created_at' => $this->created_at,
        ];
    }
}
