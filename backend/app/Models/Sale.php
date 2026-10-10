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
        'order_type',
        'table_no',
        'waiter_id',
        'kitchen_status',
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
        'price_level',
        'points_earned',
        'points_redeemed',
        'points_discount',
        'points_reversed',
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
            'points_earned' => 'integer',
            'points_redeemed' => 'integer',
            'points_discount' => 'decimal:2',
            'points_reversed' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // Returns (SaleReturnController) raise refunded_amount: take back the
        // loyalty points this bill earned in proportion to the money refunded
        // — never more than earned, never below 0 on the customer.
        static::updating(function (Sale $sale) {
            if (! $sale->isDirty('refunded_amount') || ! $sale->customer_id || (int) $sale->points_earned <= 0 || (float) $sale->grand_total <= 0) {
                return;
            }
            $share = min(1, max(0, (float) $sale->refunded_amount / (float) $sale->grand_total));
            $target = $share >= 0.9999 ? (int) $sale->points_earned : (int) min($sale->points_earned, round($sale->points_earned * $share));
            $reverse = $target - (int) $sale->points_reversed;
            if ($reverse <= 0) {
                return;
            }
            $customer = Customer::whereKey($sale->customer_id)->lockForUpdate()->first();
            if ($customer) {
                $take = min($reverse, (int) $customer->loyalty_points);
                if ($take > 0) {
                    $customer->decrement('loyalty_points', $take);
                }
            }
            $sale->points_reversed = $target;
        });
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

    public function payments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SalePayment::class)->with('user')->orderBy('id');
    }

    public function waiter(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Waiter::class);
    }
}
