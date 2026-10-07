<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Sale extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'invoice_number',
        'idempotency_key',
        'customer_id',
        'cashier_id',
        'sale_date',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'grand_total',
        'payment_method',
        'payment_received',
        'change_amount',
        'paid_amount',
        'refunded_amount',
        'status',
        'payment_status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'sale_date' => 'datetime',
            'subtotal' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'payment_received' => 'decimal:2',
            'change_amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'refunded_amount' => 'decimal:2',
        ];
    }

    /**
     * Revenue actually kept after returns — what dashboards/reports should
     * sum instead of raw grand_total, so returned goods stop inflating
     * "today's sales" figures.
     */
    public function getNetRevenueAttribute(): string
    {
        return number_format(max(0, $this->grand_total - $this->refunded_amount), 2, '.', '');
    }

    public function getRouteKeyName(): string
    {
        return 'invoice_number';
    }

    public function getDueAmountAttribute(): string
    {
        return number_format(max(0, $this->grand_total - $this->paid_amount), 2, '.', '');
    }

    /**
     * payment_status is always derived from paid_amount vs grand_total —
     * never set it directly.
     */
    public function syncPaymentStatus(): void
    {
        $this->payment_status = match (true) {
            $this->paid_amount >= $this->grand_total => 'paid',
            $this->paid_amount > 0 => 'partial',
            default => 'pending',
        };
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class);
    }
}
