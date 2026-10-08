<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Expense extends Model
{
    // Suggested on the Expenses page even before the shop has used them.
    public const DEFAULT_CATEGORIES = [
        'Rent',
        'Electricity bill',
        'Gas bill',
        'Water bill',
        'Internet / phone',
        'Salaries',
        'Tea & food',
        'Transport / fuel',
        'Repairs',
        'Shop supplies',
        'Taxes & fees',
        'Other',
    ];

    protected $fillable = [
        'expense_date',
        'category',
        'amount',
        'payment_method',
        'note',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'expense_date' => 'date:Y-m-d',
            'amount' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
