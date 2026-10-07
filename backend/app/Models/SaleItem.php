<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    protected $fillable = [
        'sale_id',
        'variant_id',
        'quantity',
        'unit_price',
        'discount_per_item',
        'total_price',
    ];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'discount_per_item' => 'decimal:2',
            'total_price' => 'decimal:2',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function variant(): BelongsTo
    {
        // withTrashed so a discontinued/deleted variant still resolves its
        // name on historical invoices instead of showing blank.
        return $this->belongsTo(ProductVariant::class, 'variant_id')->withTrashed();
    }
}
