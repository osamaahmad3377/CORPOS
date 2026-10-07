<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockAdjustmentRequest;
use App\Http\Resources\ProductVariantResource;
use App\Models\ProductVariant;
use App\Models\StockAdjustment;
use App\Services\ActivityLogger;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $query = ProductVariant::with('product');

        if ($request->boolean('low_stock')) {
            $query->whereColumn('stock_qty', '<=', 'low_stock_threshold');
        }

        $variants = $query->orderBy('id')->paginate($request->integer('per_page', 20));

        return ProductVariantResource::collection($variants);
    }

    public function adjustments(Request $request)
    {
        $adjustments = StockAdjustment::with(['variant.product', 'adjuster'])
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        $adjustments->getCollection()->transform(fn (StockAdjustment $adjustment) => [
            'id' => $adjustment->id,
            'product_name' => $adjustment->variant?->product?->name,
            'color' => $adjustment->variant?->color,
            'size' => $adjustment->variant?->size,
            'adjustment_type' => $adjustment->adjustment_type,
            'quantity_before' => $adjustment->quantity_before,
            'quantity_after' => $adjustment->quantity_after,
            'reason' => $adjustment->reason,
            'adjusted_by' => $adjustment->adjuster?->name,
            'created_at' => $adjustment->created_at,
        ]);

        return response()->json($adjustments);
    }

    public function adjust(StoreStockAdjustmentRequest $request)
    {
        $validated = $request->validated();
        $user = $request->user();
        $dbType = $validated['type'] === 'count' ? 'adjustment' : $validated['type'];

        $variant = DB::transaction(function () use ($validated, $dbType, $user) {
            $variant = ProductVariant::lockForUpdate()->findOrFail($validated['variant_id']);

            $delta = match ($dbType) {
                'adjustment' => $validated['new_quantity'] - $variant->stock_qty,
                'in' => $validated['quantity'],
                default => -$validated['quantity'],
            };

            if ($variant->stock_qty + $delta < 0) {
                throw ValidationException::withMessages([
                    'quantity' => ["Cannot remove {$validated['quantity']} — only {$variant->stock_qty} in stock."],
                ]);
            }

            StockService::adjust($variant, $delta, $dbType, $user, $validated['reason'] ?? null);

            ActivityLogger::log($user, 'adjust', 'inventory', "Adjusted stock for variant #{$variant->id} ({$dbType}, delta {$delta}).");

            return $variant;
        });

        return new ProductVariantResource($variant->fresh());
    }
}
