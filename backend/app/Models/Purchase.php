<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Purchase extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'supplier_id',
        'po_number',
        'idempotency_key',
        'invoice_number',
        'purchase_date',
        'total_amount',
        'discount',
        'grand_total',
        'paid_amount',
        'refunded_amount',
        'payment_status',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date' => 'date',
            'total_amount' => 'decimal:2',
            'discount' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'refunded_amount' => 'decimal:2',
        ];
    }

    public function getDueAmountAttribute(): string
    {
        return number_format(max(0, $this->grand_total - $this->paid_amount), 2, '.', '');
    }

    /** Sets payment_status from paid_amount vs grand_total — never set payment_status directly. */
    public function syncPaymentStatus(): void
    {
        $this->payment_status = match (true) {
            $this->paid_amount >= $this->grand_total => 'paid',
            $this->paid_amount > 0 => 'partial',
            default => 'pending',
        };
    }

    public function getRouteKeyName(): string
    {
        return 'po_number';
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseItem::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(PurchaseReturn::class);
    }
}
