<?php

namespace App\Services;

use App\Models\Ingredient;
use App\Models\IngredientMovement;
use App\Models\RecipeItem;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * The only place kitchen stock changes. Selling a dish takes its recipe off
 * the ingredients (stock may go below zero — a dish is never refused, the
 * kitchen just gets a warning); buying, counting and waste are recorded too.
 */
class IngredientService
{
    /** Called once when a bill is paid (new sale or a held order completed). */
    public static function consumeForSale(Sale $sale, ?User $user): void
    {
        if (! Schema::hasTable('recipe_items')) {
            return;
        }
        $sale->loadMissing('items');
        $qtyByVariant = [];
        foreach ($sale->items as $item) {
            $qtyByVariant[$item->variant_id] = ($qtyByVariant[$item->variant_id] ?? 0) + (float) $item->quantity;
        }
        if (! $qtyByVariant) {
            return;
        }

        // total use per ingredient across the whole bill
        $use = [];
        foreach (RecipeItem::whereIn('variant_id', array_keys($qtyByVariant))->get() as $r) {
            $use[$r->ingredient_id] = ($use[$r->ingredient_id] ?? 0) + (float) $r->quantity * $qtyByVariant[$r->variant_id];
        }
        foreach ($use as $ingredientId => $qty) {
            $ingredient = Ingredient::lockForUpdate()->find($ingredientId);
            if ($ingredient && $qty > 0) {
                self::move($ingredient, -$qty, 'sale', $user, null, $sale->id, 'Bill '.$sale->invoice_number);
            }
        }
    }

    /**
     * Buying adds stock and updates the average cost:
     * (old stock × old cost + new qty × new cost) / total.
     */
    public static function purchase(Ingredient $ingredient, float $qty, ?float $unitCost, ?User $user, ?string $note = null): IngredientMovement
    {
        if ($unitCost !== null && $unitCost >= 0) {
            $oldQty = max(0, (float) $ingredient->stock_qty);
            $total = $oldQty + $qty;
            $ingredient->cost_per_unit = $total > 0
                ? round(($oldQty * (float) $ingredient->cost_per_unit + $qty * $unitCost) / $total, 2)
                : $unitCost;
        }

        return self::move($ingredient, $qty, 'purchase', $user, $unitCost, null, $note);
    }

    /** Set stock to what was actually counted. */
    public static function count(Ingredient $ingredient, float $counted, ?User $user, ?string $note = null): ?IngredientMovement
    {
        $diff = round($counted - (float) $ingredient->stock_qty, 3);

        return $diff == 0.0 ? null : self::move($ingredient, $diff, 'count', $user, null, null, $note);
    }

    public static function waste(Ingredient $ingredient, float $qty, ?User $user, ?string $note = null): IngredientMovement
    {
        return self::move($ingredient, -abs($qty), 'waste', $user, null, null, $note);
    }

    public static function move(Ingredient $ingredient, float $change, string $type, ?User $user, ?float $unitCost = null, ?int $saleId = null, ?string $note = null): IngredientMovement
    {
        $ingredient->stock_qty = round((float) $ingredient->stock_qty + $change, 3);
        $ingredient->save();

        return IngredientMovement::create([
            'ingredient_id' => $ingredient->id,
            'type' => $type,
            'quantity_change' => round($change, 3),
            'balance_after' => $ingredient->stock_qty,
            'unit_cost' => $unitCost,
            'sale_id' => $saleId,
            'user_id' => $user?->id,
            'note' => $note ? mb_substr($note, 0, 255) : null,
        ]);
    }

    /** Cost of one dish from its recipe (ingredient average costs). */
    public static function recipeCost(int $variantId): float
    {
        return round((float) RecipeItem::where('variant_id', $variantId)
            ->join('ingredients', 'ingredients.id', '=', 'recipe_items.ingredient_id')
            ->sum(\Illuminate\Support\Facades\DB::raw('recipe_items.quantity * ingredients.cost_per_unit')), 2);
    }
}
