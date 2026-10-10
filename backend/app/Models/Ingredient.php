<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ingredient extends Model
{
    public const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'dozen', 'packet'];

    protected $fillable = ['name', 'unit', 'stock_qty', 'alert_qty', 'cost_per_unit', 'is_active'];

    protected function casts(): array
    {
        return [
            'stock_qty' => 'decimal:3',
            'alert_qty' => 'decimal:3',
            'cost_per_unit' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function movements(): HasMany
    {
        return $this->hasMany(IngredientMovement::class);
    }

    public function recipeItems(): HasMany
    {
        return $this->hasMany(RecipeItem::class);
    }

    /** ok | low | out */
    public function level(): string
    {
        $stock = (float) $this->stock_qty;
        if ($stock <= 0) {
            return 'out';
        }

        return $stock <= (float) $this->alert_qty ? 'low' : 'ok';
    }
}
