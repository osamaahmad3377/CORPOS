<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotationItem extends Model
{
    protected $fillable = [
        'quotation_id',
        'variant_id',
        'quantity',
        'unit_price',
        'discount_per_item',
        'total_price',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'float',
            'unit_price' => 'decimal:2',
            'discount_per_item' => 'decimal:2',
            'total_price' => 'decimal:2',
        ];
    }

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class);
    }

    public function variant(): BelongsTo
    {
        // withTrashed so a deleted item still shows its name on old quotes
        return $this->belongsTo(ProductVariant::class, 'variant_id')->withTrashed();
    }
}
