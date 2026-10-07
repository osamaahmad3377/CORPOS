<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockAdjustmentRequest;
use App\Http\Resources\ProductVariantResource;
use App\Models\ProductVariant;
use App\Models\StockAdjustment;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SerialService;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $query = ProductVariant::with('product');

        if ($request->filled('search')) {
            $term = $request->string('search')->trim()->toString();
            $query->where(function ($q) use ($term) {
                $q->where('sku', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%{$term}%"));
            });
        }

        // stock=low (at/below threshold, incl. empty) | stock=out (nothing left); low_stock=1 kept for older callers.
        $stock = $request->string('stock')->toString();
        if ($stock === 'low' || $request->boolean('low_stock')) {
            $query->whereColumn('stock_qty', '<=', 'low_stock_threshold');
        } elseif ($stock === 'out') {
            $query->where('stock_qty', '<=', 0);
        }

        $variants = $query->orderBy('id')->paginate($request->integer('per_page', 20));

        $summary = [
            'items' => ProductVariant::count(),
            'low_stock' => ProductVariant::whereColumn('stock_qty', '<=', 'low_stock_threshold')->where('stock_qty', '>', 0)->count(),
            'out_of_stock' => ProductVariant::where('stock_qty', '<=', 0)->count(),
        ];
        // Stock value is at cost — only for staff allowed to see cost prices.
        if ($request->user()?->hasPermission('purchases.view')) {
            $summary['stock_value'] = round((float) ProductVariant::where('stock_qty', '>', 0)->sum(DB::raw('stock_qty * purchase_price')), 2);
        }

        return ProductVariantResource::collection($variants)->additional(['summary' => $summary]);
    }

    public function adjustments(Request $request)
    {
        $query = StockAdjustment::with(['variant.product', 'adjuster']);

        if ($request->filled('variant_id')) {
            $query->where('variant_id', $request->integer('variant_id'));
        }
        if ($request->filled('type')) {
            $query->where('adjustment_type', $request->string('type')->toString());
        }
        if ($request->filled('search')) {
            $term = $request->string('search')->trim()->toString();
            $query->whereHas('variant', fn ($v) => $v->withTrashed()->where(function ($q) use ($term) {
                $q->where('sku', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhereHas('product', fn ($p) => $p->withTrashed()->where('name', 'like', "%{$term}%"));
            }));
        }
        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->date('start_date'));
        }
        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->date('end_date'));
        }

        $adjustments = $query
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        $adjustments->getCollection()->transform(fn (StockAdjustment $adjustment) => [
            'id' => $adjustment->id,
            'variant_id' => $adjustment->variant_id,
            'sku' => $adjustment->variant?->sku,
            'unit' => $adjustment->variant?->product?->unit ?? 'pcs',
            'product_name' => $adjustment->variant?->product?->name,
            'color' => $adjustment->variant?->color,
            'size' => $adjustment->variant?->size,
            'adjustment_type' => $adjustment->adjustment_type,
            'quantity_before' => $adjustment->quantity_before,
            'quantity_change' => $adjustment->quantity_change,
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

            // Serial-tracked: name the exact units; a bare recount can't say which.
            $serials = SerialService::clean($validated['serials'] ?? [], 'serials');
            if (SerialService::tracks($variant)) {
                if ($dbType === 'adjustment') {
                    throw ValidationException::withMessages(['type' => ['For serial/IMEI items use Add or Remove and list the serial numbers.']]);
                }
                $dbType === 'in'
                    ? SerialService::receive($variant, $serials, abs($delta), 'serials')
                    : SerialService::remove($variant, $serials, abs($delta), 'serials', 'damaged');
            }
            if ($delta > 0) {
                BatchService::receive($variant, $delta, trim((string) ($validated['batch_no'] ?? '')) ?: null, $validated['expiry_date'] ?? null, (float) $variant->purchase_price);
            } elseif ($delta < 0) {
                BatchService::consume($variant, abs($delta));
            }

            StockService::adjust($variant, $delta, $dbType, $user, $validated['reason'] ?? null);

            ActivityLogger::log($user, 'adjust', 'inventory', "Adjusted stock for variant #{$variant->id} ({$dbType}, delta {$delta}).");

            return $variant;
        });

        return new ProductVariantResource($variant->fresh());
    }
}
