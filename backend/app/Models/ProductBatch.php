<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductBatch extends Model
{
    protected $fillable = ['variant_id', 'batch_no', 'expiry_date', 'quantity', 'initial_quantity', 'cost_price', 'purchase_item_id'];

    protected function casts(): array
    {
        return [
            'expiry_date' => 'date:Y-m-d',
            'quantity' => 'float',
            'initial_quantity' => 'float',
            'cost_price' => 'decimal:2',
        ];
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id')->withTrashed();
    }
}
