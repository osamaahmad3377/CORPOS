<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * An offer applied automatically at checkout (see App\Services\SalePricing).
 */
class Promotion extends Model
{
    use SoftDeletes;

    public const TYPES = ['percent', 'fixed', 'buy_x_get_y'];

    public const APPLIES_TO = ['all', 'category', 'product'];

    protected $fillable = [
        'name',
        'type',
        'value',
        'buy_qty',
        'get_qty',
        'applies_to',
        'category_id',
        'product_id',
        'starts_at',
        'ends_at',
        'is_active',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'buy_qty' => 'integer',
            'get_qty' => 'integer',
            'starts_at' => 'date:Y-m-d',
            'ends_at' => 'date:Y-m-d',
            'is_active' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class)->withTrashed();
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    /** Switched on and inside its dates today. */
    public function scopeRunning(Builder $query): Builder
    {
        $today = now()->toDateString();

        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhereDate('starts_at', '<=', $today))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhereDate('ends_at', '>=', $today));
    }

    /** active | scheduled | expired | off — for list badges. */
    public function getStatusAttribute(): string
    {
        $today = now()->toDateString();

        return match (true) {
            ! $this->is_active => 'off',
            $this->ends_at && $this->ends_at->toDateString() < $today => 'expired',
            $this->starts_at && $this->starts_at->toDateString() > $today => 'scheduled',
            default => 'active',
        };
    }
}
