<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\IngredientMovement;
use App\Models\ProductVariant;
use App\Models\RecipeItem;
use App\Services\ActivityLogger;
use App\Services\IngredientService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Kitchen stock (restaurant raw materials), dish recipes, and the alerts the
 * Home screen and top bar show when an ingredient runs low.
 */
class IngredientController extends Controller
{
    private function row(Ingredient $i, array $usedIn = []): array
    {
        return [
            'id' => $i->id,
            'name' => $i->name,
            'unit' => $i->unit,
            'stock_qty' => (float) $i->stock_qty,
            'alert_qty' => (float) $i->alert_qty,
            'cost_per_unit' => (float) $i->cost_per_unit,
            'stock_value' => round(max(0, (float) $i->stock_qty) * (float) $i->cost_per_unit, 2),
            'level' => $i->level(),
            'is_active' => $i->is_active,
            'used_in' => $usedIn[$i->id] ?? 0,
            'updated_at' => $i->updated_at?->toIso8601String(),
        ];
    }

    public function index(Request $request)
    {
        $q = Ingredient::query()->orderBy('name');
        if ($s = trim((string) $request->query('search'))) {
            $q->where('name', 'like', "%{$s}%");
        }
        $level = $request->query('level');
        if ($level === 'low') {
            $q->whereColumn('stock_qty', '<=', 'alert_qty')->where('stock_qty', '>', 0);
        } elseif ($level === 'out') {
            $q->where('stock_qty', '<=', 0);
        } elseif ($level === 'alert') {
            $q->whereColumn('stock_qty', '<=', 'alert_qty');
        }
        $list = $q->get();
        $usedIn = RecipeItem::selectRaw('ingredient_id, COUNT(DISTINCT variant_id) as n')->groupBy('ingredient_id')->pluck('n', 'ingredient_id')->all();

        $all = Ingredient::all();

        return response()->json([
            'data' => $list->map(fn ($i) => $this->row($i, $usedIn))->values(),
            'summary' => [
                'items' => $all->count(),
                'low' => $all->filter(fn ($i) => $i->level() === 'low')->count(),
                'out' => $all->filter(fn ($i) => $i->level() === 'out')->count(),
                'stock_value' => round($all->sum(fn ($i) => max(0, (float) $i->stock_qty) * (float) $i->cost_per_unit), 2),
            ],
            'units' => Ingredient::UNITS,
        ]);
    }

    /** Low / finished ingredients, most urgent first — for Home and the top bar. */
    public function alerts()
    {
        $list = Ingredient::where('is_active', true)->whereColumn('stock_qty', '<=', 'alert_qty')
            ->orderByRaw('CASE WHEN stock_qty <= 0 THEN 0 ELSE 1 END')
            ->orderByRaw('CASE WHEN alert_qty > 0 THEN stock_qty / alert_qty ELSE 0 END')
            ->limit(50)->get();

        return response()->json(['data' => $list->map(fn ($i) => $this->row($i))->values(), 'count' => $list->count()]);
    }

    private function rules(?Ingredient $i = null): array
    {
        return [
            'name' => ['required', 'string', 'max:120', Rule::unique('ingredients', 'name')->ignore($i?->id)],
            'unit' => ['required', Rule::in(Ingredient::UNITS)],
            'alert_qty' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'cost_per_unit' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules() + ['stock_qty' => ['nullable', 'numeric', 'min:0', 'max:9999999']]);
        $ingredient = DB::transaction(function () use ($data, $request) {
            $ingredient = Ingredient::create([
                'name' => trim($data['name']),
                'unit' => $data['unit'],
                'alert_qty' => $data['alert_qty'] ?? 0,
                'cost_per_unit' => $data['cost_per_unit'] ?? 0,
            ]);
            if (($data['stock_qty'] ?? 0) > 0) {
                IngredientService::purchase($ingredient, (float) $data['stock_qty'], isset($data['cost_per_unit']) ? (float) $data['cost_per_unit'] : null, $request->user(), 'Opening stock');
            }

            return $ingredient;
        });
        ActivityLogger::log($request->user(), 'create', 'ingredients', "Added kitchen item {$ingredient->name}.");

        return response()->json(['data' => $this->row($ingredient->fresh())], 201);
    }

    public function update(Request $request, Ingredient $ingredient)
    {
        $data = $request->validate($this->rules($ingredient));
        $ingredient->update([
            'name' => trim($data['name']),
            'unit' => $data['unit'],
            'alert_qty' => $data['alert_qty'] ?? 0,
            'cost_per_unit' => $data['cost_per_unit'] ?? $ingredient->cost_per_unit,
            'is_active' => $data['is_active'] ?? $ingredient->is_active,
        ]);

        return response()->json(['data' => $this->row($ingredient->fresh())]);
    }

    public function destroy(Request $request, Ingredient $ingredient)
    {
        $used = RecipeItem::where('ingredient_id', $ingredient->id)->count();
        if ($used && ! $request->boolean('force')) {
            abort(response()->json(['message' => "This is used in {$used} dish recipe(s). Remove it from those recipes first, or switch it off instead."], 422));
        }
        $name = $ingredient->name;
        $ingredient->delete();
        ActivityLogger::log($request->user(), 'delete', 'ingredients', "Removed kitchen item {$name}.");

        return response()->json(['ok' => true]);
    }

    /** Buy (add stock), count (set to counted amount) or waste (spoiled / dropped). */
    public function adjust(Request $request, Ingredient $ingredient)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['purchase', 'count', 'waste'])],
            'quantity' => ['required', 'numeric', 'min:0', 'max:9999999'],
            'unit_cost' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        DB::transaction(function () use ($data, $ingredient, $request) {
            $ingredient = Ingredient::lockForUpdate()->find($ingredient->id);
            $qty = (float) $data['quantity'];
            match ($data['type']) {
                'purchase' => $qty > 0 ? IngredientService::purchase($ingredient, $qty, isset($data['unit_cost']) ? (float) $data['unit_cost'] : null, $request->user(), $data['note'] ?? null) : null,
                'count' => IngredientService::count($ingredient, $qty, $request->user(), $data['note'] ?? null),
                'waste' => $qty > 0 ? IngredientService::waste($ingredient, $qty, $request->user(), $data['note'] ?? null) : null,
            };
        });

        return response()->json(['data' => $this->row($ingredient->fresh())]);
    }

    public function movements(Ingredient $ingredient)
    {
        $rows = $ingredient->movements()->with(['user:id,name', 'sale:id,invoice_number'])->latest('id')->limit(200)->get()
            ->map(fn (IngredientMovement $m) => [
                'id' => $m->id,
                'type' => $m->type,
                'quantity_change' => (float) $m->quantity_change,
                'balance_after' => (float) $m->balance_after,
                'unit_cost' => $m->unit_cost !== null ? (float) $m->unit_cost : null,
                'invoice' => $m->sale?->invoice_number,
                'user' => $m->user?->name,
                'note' => $m->note,
                'created_at' => $m->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $rows]);
    }

    // ------------------------------------------------------------ recipes

    public function recipe(ProductVariant $variant)
    {
        $items = RecipeItem::with('ingredient')->where('variant_id', $variant->id)->get()->map(fn ($r) => [
            'ingredient_id' => $r->ingredient_id,
            'name' => $r->ingredient?->name,
            'unit' => $r->ingredient?->unit,
            'quantity' => (float) $r->quantity,
            'cost' => round((float) $r->quantity * (float) ($r->ingredient?->cost_per_unit ?? 0), 2),
            'level' => $r->ingredient?->level(),
        ]);

        return response()->json([
            'data' => $items,
            'cost' => IngredientService::recipeCost($variant->id),
            'selling_price' => (float) $variant->selling_price,
        ]);
    }

    /** Replace a dish's recipe; optionally use the recipe cost as the dish's buying price (for profit). */
    public function saveRecipe(Request $request, ProductVariant $variant)
    {
        $data = $request->validate([
            'items' => ['present', 'array', 'max:60'],
            'items.*.ingredient_id' => ['required', 'integer', 'distinct', 'exists:ingredients,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:99999'],
            'use_as_cost' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($data, $variant) {
            RecipeItem::where('variant_id', $variant->id)->delete();
            foreach ($data['items'] as $item) {
                RecipeItem::create(['variant_id' => $variant->id, 'ingredient_id' => $item['ingredient_id'], 'quantity' => $item['quantity']]);
            }
            $cost = IngredientService::recipeCost($variant->id);
            if (($data['use_as_cost'] ?? true) && $cost > 0) {
                $variant->update(['purchase_price' => $cost]);
            }
        });

        return $this->recipe($variant->fresh());
    }
}
