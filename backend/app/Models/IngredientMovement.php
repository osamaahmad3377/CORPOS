<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IngredientMovement extends Model
{
    protected $fillable = ['ingredient_id', 'type', 'quantity_change', 'balance_after', 'unit_cost', 'sale_id', 'user_id', 'note'];

    protected function casts(): array
    {
        return ['quantity_change' => 'decimal:3', 'balance_after' => 'decimal:3', 'unit_cost' => 'decimal:2'];
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
