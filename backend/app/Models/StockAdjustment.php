<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class StockAdjustment extends Model
{
    protected $fillable = [
        'variant_id',
        'adjustment_type',
        'quantity_before',
        'quantity_change',
        'quantity_after',
        'reason',
        'reference_id',
        'reference_type',
        'adjusted_by',
    ];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id')->withTrashed();
    }

    public function adjuster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'adjusted_by');
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }
}
