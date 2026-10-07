<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RecordPurchasePaymentRequest;
use App\Http\Requests\StorePurchaseRequest;
use App\Http\Resources\PurchaseResource;
use App\Models\ProductVariant;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SerialService;
use App\Services\StockService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseController extends Controller
{
    public function index(Request $request)
    {
        $query = Purchase::with(['supplier', 'creator'])->withCount('items');

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->integer('supplier_id'));
        }

        if ($request->filled('search')) {
            $term = $request->string('search')->trim()->toString();
            $query->where(fn ($q) => $q->where('po_number', 'like', "%{$term}%")->orWhere('invoice_number', 'like', "%{$term}%"));
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->string('payment_status'));
        }

        if ($request->filled('start_date')) {
            $query->whereDate('purchase_date', '>=', $request->date('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('purchase_date', '<=', $request->date('end_date'));
        }

        $purchases = $query->orderByDesc('id')->paginate($request->integer('per_page', 20));

        return PurchaseResource::collection($purchases);
    }

    public function store(StorePurchaseRequest $request)
    {
        $validated = $request->validated();
        $user = $request->user();
        $idempotencyKey = $validated['idempotency_key'] ?? null;

        if ($idempotencyKey) {
            $existing = Purchase::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return new PurchaseResource($existing->load(['supplier', 'creator', 'items.variant.product']));
            }
        }

        // Two near-simultaneous purchase entries can compute the same "next"
        // PO number before either commits — retry a few times with a
        // freshly generated number instead of surfacing a raw 500.
        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        try {
            $purchase = DB::transaction(function () use ($validated, $user, $idempotencyKey) {
            if (! Supplier::find($validated['supplier_id'])) {
                throw ValidationException::withMessages([
                    'supplier_id' => ['Selected supplier is no longer available.'],
                ]);
            }

            $totalAmount = collect($validated['items'])->sum(fn ($item) => $item['unit_price'] * $item['quantity']);
            $discount = $validated['discount'] ?? 0;
            $grandTotal = $totalAmount - $discount;

            if ($grandTotal < 0) {
                throw ValidationException::withMessages([
                    'discount' => ['Discount cannot exceed the purchase total.'],
                ]);
            }

            $purchase = new Purchase([
                'supplier_id' => $validated['supplier_id'],
                'po_number' => $this->nextPoNumber(),
                'idempotency_key' => $idempotencyKey,
                'invoice_number' => $validated['invoice_number'] ?? null,
                'purchase_date' => $validated['purchase_date'],
                'total_amount' => $totalAmount,
                'discount' => $discount,
                'grand_total' => $grandTotal,
                'paid_amount' => min($validated['paid_amount'] ?? 0, $grandTotal),
                'notes' => $validated['notes'] ?? null,
                'created_by' => $user->id,
            ]);
            $purchase->syncPaymentStatus();
            $purchase->save();

            $variantIds = collect($validated['items'])->pluck('variant_id')->unique();
            $variants = ProductVariant::whereIn('id', $variantIds)->lockForUpdate()->get()->keyBy('id');

            if ($variants->count() < $variantIds->count()) {
                throw ValidationException::withMessages([
                    'items' => ['One or more selected products are no longer available.'],
                ]);
            }

            foreach ($validated['items'] as $i => $item) {
                $variant = $variants[$item['variant_id']];

                $purchaseItem = PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'variant_id' => $item['variant_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'total_price' => $item['unit_price'] * $item['quantity'],
                ]);

                SerialService::receive($variant, SerialService::clean($item['serials'] ?? [], "items.{$i}.serials"), (float) $item['quantity'], "items.{$i}.serials", $purchase->id);
                BatchService::receive($variant, (float) $item['quantity'], trim((string) ($item['batch_no'] ?? '')) ?: null, $item['expiry_date'] ?? null, (float) $item['unit_price'], $purchaseItem->id);
                StockService::increment($variant, $item['quantity'], 'in', $user, $purchase, 'Purchase '.$purchase->po_number);
            }

            ActivityLogger::log($user, 'create', 'purchases', "Created purchase {$purchase->po_number}.");

            return $purchase;
            });
            break;
        } catch (QueryException $e) {
            if ($idempotencyKey && str_contains($e->getMessage(), 'idempotency_key')) {
                $existing = Purchase::where('idempotency_key', $idempotencyKey)->first();
                if ($existing) {
                    return new PurchaseResource($existing->load(['supplier', 'creator', 'items.variant.product']));
                }
            }
            if (str_contains($e->getMessage(), 'po_number') && $attempt < $maxAttempts) {
                continue;
            }
            throw $e;
        }
        }

        return new PurchaseResource($purchase->load(['supplier', 'creator', 'items.variant.product']));
    }

    public function show(Purchase $purchase)
    {
        return new PurchaseResource($purchase->load(['supplier', 'creator', 'items.variant.product', 'returns.items', 'returns.processor']));
    }

    public function recordPayment(RecordPurchasePaymentRequest $request, Purchase $purchase)
    {
        $validated = $request->validated();
        $user = $request->user();

        DB::transaction(function () use ($validated, $purchase, $user) {
            $locked = Purchase::whereKey($purchase->id)->lockForUpdate()->firstOrFail();
            $due = max(0, $locked->grand_total - $locked->paid_amount);

            if ($validated['amount'] > $due) {
                throw ValidationException::withMessages([
                    'amount' => ["Amount exceeds the remaining due of ".number_format($due, 2).'.'],
                ]);
            }

            $locked->paid_amount += $validated['amount'];
            $locked->syncPaymentStatus();
            $locked->save();

            ActivityLogger::log($user, 'payment', 'purchases', "Recorded payment of {$validated['amount']} against purchase {$locked->po_number}.");
        });

        return new PurchaseResource($purchase->fresh(['supplier', 'creator', 'items.variant.product', 'returns.items', 'returns.processor']));
    }

    private function nextPoNumber(): string
    {
        $next = 2000 + Purchase::withTrashed()->count();

        while (Purchase::withTrashed()->where('po_number', "PO-{$next}")->exists()) {
            $next++;
        }

        return "PO-{$next}";
    }
}
