<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A price quotation / estimate for a customer. Never touches stock or money.
 * Status: draft → sent → converted (turned into a sale). A draft/sent quote
 * whose valid_until date has passed is reported as "expired".
 */
class Quotation extends Model
{
    public const STATUSES = ['draft', 'sent', 'converted', 'expired'];

    protected $fillable = [
        'quote_number',
        'customer_id',
        'customer_name',
        'customer_phone',
        'valid_until',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'grand_total',
        'notes',
        'status',
        'converted_sale_id',
        'converted_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'valid_until' => 'date:Y-m-d',
            'converted_at' => 'datetime',
            'subtotal' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'grand_total' => 'decimal:2',
        ];
    }

    /** Status as shown to the user: open quotes past their date are "expired". */
    public function getEffectiveStatusAttribute(): string
    {
        if (in_array($this->status, ['draft', 'sent'], true)
            && $this->valid_until && $this->valid_until->lt(now()->startOfDay())) {
            return 'expired';
        }

        return $this->status;
    }

    /** Filter by the status the user sees (see getEffectiveStatusAttribute). */
    public function scopeEffectiveStatus(Builder $query, string $status): Builder
    {
        $today = now()->toDateString();

        return match ($status) {
            'expired' => $query->where(fn ($q) => $q->where('status', 'expired')
                ->orWhere(fn ($q) => $q->whereIn('status', ['draft', 'sent'])->whereNotNull('valid_until')->whereDate('valid_until', '<', $today))),
            'draft', 'sent' => $query->where('status', $status)
                ->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', $today)),
            // "open" = still usable (draft or sent, not past its date)
            'open' => $query->whereIn('status', ['draft', 'sent'])
                ->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', $today)),
            default => $query->where('status', $status),
        };
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class)->withTrashed();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function convertedSale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'converted_sale_id')->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuotationItem::class);
    }
}
