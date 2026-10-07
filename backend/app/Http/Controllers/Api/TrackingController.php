<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductVariantResource;
use App\Models\ProductBatch;
use App\Models\ProductSerial;
use App\Models\ProductVariant;
use Illuminate\Http\Request;

/** Serial/IMEI lookups and batch/expiry lists. */
class TrackingController extends Controller
{
    public function serial(string $serial)
    {
        $row = ProductSerial::with(['variant.product', 'saleItem.sale.customer'])->where('serial', trim($serial))->first();
        if (! $row) {
            return response()->json(['message' => 'Serial not found.'], 404);
        }

        $sale = $row->saleItem?->sale;
        $months = $row->variant?->product?->warranty_months;

        return response()->json([
            'serial' => $row->serial,
            'status' => $row->status,
            'variant' => new ProductVariantResource($row->variant),
            'sold_at' => $row->sold_at,
            'invoice_number' => $sale?->invoice_number,
            'customer' => $sale?->customer?->name,
            'warranty_months' => $months,
            'warranty_until' => $row->sold_at && $months ? $row->sold_at->copy()->addMonths($months)->toDateString() : null,
        ]);
    }

    public function variantSerials(Request $request, ProductVariant $variant)
    {
        return response()->json([
            'data' => ProductSerial::where('variant_id', $variant->id)
                ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
                ->orderBy('serial')->get(['id', 'serial', 'status', 'sold_at']),
        ]);
    }

    public function variantBatches(ProductVariant $variant)
    {
        return response()->json([
            'data' => ProductBatch::where('variant_id', $variant->id)->where('quantity', '>', 0)
                ->orderByRaw('expiry_date IS NULL, expiry_date ASC')->get(),
        ]);
    }

    public function expiring(Request $request)
    {
        $days = max(0, min(365, $request->integer('days', 30)));

        $batches = ProductBatch::with('variant.product')
            ->where('quantity', '>', 0)
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<=', now()->addDays($days)->toDateString())
            ->orderBy('expiry_date')
            ->get()
            ->map(fn ($b) => [
                'id' => $b->id,
                'batch_no' => $b->batch_no,
                'expiry_date' => $b->expiry_date?->toDateString(),
                'days_left' => (int) now()->startOfDay()->diffInDays($b->expiry_date, false),
                'quantity' => $b->quantity,
                'product_name' => $b->variant?->product?->name,
                'unit' => $b->variant?->product?->unit,
                'variant' => ['id' => $b->variant_id, 'color' => $b->variant?->color, 'size' => $b->variant?->size, 'sku' => $b->variant?->sku],
            ]);

        return response()->json(['data' => $batches, 'days' => $days]);
    }
}
