<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'email' => $this->email,
            'address' => $this->address,
            'city' => $this->city,
            'notes' => $this->notes,
            'total_purchases' => $this->total_purchases,
            'price_level' => $this->price_level ?: 'retail',
            'loyalty_points' => (int) $this->loyalty_points,
            'sales_count' => $this->whenCounted('sales'),
            'last_sale_date' => $this->sales_max_sale_date,
            'total_due' => $this->total_due ?? '0.00',
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
