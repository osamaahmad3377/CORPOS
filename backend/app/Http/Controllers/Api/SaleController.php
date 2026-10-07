<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RecordSalePaymentRequest;
use App\Http\Requests\ResumeSaleRequest;
use App\Http\Requests\StoreSaleRequest;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SerialService;
use App\Services\StockService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use App\Support\Qty;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleController extends Controller
{
    public function index(Request $request)
    {
        $query = Sale::with(['customer', 'cashier'])->withCount('items');

        if (! $request->user()->hasPermission('sales.view_all')) {
            $query->where('cashier_id', $request->user()->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->string('payment_status'));
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->integer('customer_id'));
        }

        if ($request->filled('search')) {
            $term = '%'.$request->string('search')->trim().'%';
            $query->where(function ($q) use ($term) {
                $q->where('invoice_number', 'like', $term)
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', $term)->orWhere('phone', 'like', $term));
            });
        }

        if ($request->filled('start_date')) {
            $query->whereDate('sale_date', '>=', $request->date('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('sale_date', '<=', $request->date('end_date'));
        }

        $sales = $query->orderByDesc('id')->paginate($request->integer('per_page', 20));

        return SaleResource::collection($sales);
    }

    public function store(StoreSaleRequest $request)
    {
        $validated = $request->validated();
        $status = $validated['status'] ?? 'completed';
        $user = $request->user();
        $idempotencyKey = $validated['idempotency_key'] ?? null;

        // A retried/double-submitted checkout (slow network, double-tap on a
        // touchscreen) must never create a second invoice or decrement stock
        // twice — return the original sale instead of creating a duplicate.
        if ($idempotencyKey) {
            $existing = Sale::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return new SaleResource($existing->load(['customer', 'cashier', 'items.variant.product']));
            }
        }

        // Two near-simultaneous checkouts can compute the same "next"
        // invoice number before either commits — retry a few times with a
        // freshly generated number instead of surfacing a raw 500.
        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        try {
            $sale = DB::transaction(function () use ($validated, $status, $user, $idempotencyKey) {
            if (! empty($validated['customer_id']) && ! Customer::find($validated['customer_id'])) {
                throw ValidationException::withMessages([
                    'customer_id' => ['Selected customer is no longer available.'],
                ]);
            }

            $variantIds = collect($validated['items'])->pluck('variant_id')->unique();
            $variants = ProductVariant::whereIn('id', $variantIds)->lockForUpdate()->get()->keyBy('id');

            if ($variants->count() < $variantIds->count()) {
                throw ValidationException::withMessages([
                    'items' => ['One or more selected products are no longer available.'],
                ]);
            }

            if ($status === 'completed') {
                $requestedByVariant = collect($validated['items'])
                    ->groupBy('variant_id')
                    ->map(fn ($rows) => Qty::round($rows->sum('quantity')));

                foreach ($requestedByVariant as $variantId => $requestedQty) {
                    $variant = $variants[$variantId];
                    if (Qty::round($variant->stock_qty) < $requestedQty) {
                        throw ValidationException::withMessages([
                            'items' => ["Insufficient stock for {$variant->sku}. Available: ".Qty::format($variant->stock_qty).'.'],
                        ]);
                    }
                }
            }

            // Price always comes from the catalog, never from the client —
            // otherwise a forged request (or a compromised cashier session)
            // could check out any item at an arbitrary price.
            $rawSubtotal = 0;
            $subtotal = 0;
            foreach ($validated['items'] as $item) {
                $unitPrice = (float) $variants[$item['variant_id']]->selling_price;
                $itemDiscount = $item['discount_per_item'] ?? 0;
                $lineTotal = ($unitPrice * $item['quantity']) - $itemDiscount;

                if ($lineTotal < 0) {
                    throw ValidationException::withMessages([
                        'items' => ["Discount for variant #{$item['variant_id']} cannot exceed its line total."],
                    ]);
                }

                $rawSubtotal += $unitPrice * $item['quantity'];
                $subtotal += $lineTotal;
            }

            $discountAmount = $validated['discount_amount'] ?? 0;
            $taxAmount = $validated['tax_amount'] ?? 0;
            $grandTotal = $subtotal - $discountAmount + $taxAmount;

            if ($grandTotal < 0) {
                throw ValidationException::withMessages([
                    'discount_amount' => ['Discount cannot exceed the sale subtotal plus tax.'],
                ]);
            }

            // A plain cashier can discount on their own authority only up to
            // a capped percentage of the pre-discount value — larger
            // discounts need someone with sales.view_all (manager/admin).
            if (! $user->hasPermission('sales.view_all') && $rawSubtotal > 0) {
                $maxPercent = config('pos.max_discount_percent_for_cashier');
                $totalDiscount = ($rawSubtotal - $subtotal) + $discountAmount;

                if ($totalDiscount > $rawSubtotal * $maxPercent / 100) {
                    throw ValidationException::withMessages([
                        'discount_amount' => ["Total discount exceeds the {$maxPercent}% limit you're authorized for. Ask a manager to apply a larger discount."],
                    ]);
                }
            }

            $paymentReceived = $validated['payment_received'] ?? ($status === 'completed' ? $grandTotal : 0);
            $changeAmount = max(0, $paymentReceived - $grandTotal);
            $paidAmount = $status === 'completed' ? min($paymentReceived, $grandTotal) : 0;

            $sale = new Sale([
                'invoice_number' => $this->nextInvoiceNumber(),
                'idempotency_key' => $idempotencyKey,
                'customer_id' => $validated['customer_id'] ?? null,
                'cashier_id' => $user->id,
                'sale_date' => now(),
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'grand_total' => $grandTotal,
                'payment_method' => $validated['payment_method'],
                'payment_received' => $paymentReceived,
                'change_amount' => $changeAmount,
                'paid_amount' => $paidAmount,
                'status' => $status,
                'order_type' => $validated['order_type'] ?? null,
                'table_no' => $validated['table_no'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);
            $sale->syncPaymentStatus();
            $sale->save();

            foreach ($validated['items'] as $i => $item) {
                $variant = $variants[$item['variant_id']];
                $unitPrice = (float) $variant->selling_price;
                $lineTotal = ($unitPrice * $item['quantity']) - ($item['discount_per_item'] ?? 0);
                $serials = SerialService::clean($item['serials'] ?? [], "items.{$i}.serials");

                $saleItem = SaleItem::create([
                    'sale_id' => $sale->id,
                    'variant_id' => $item['variant_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $unitPrice,
                    'cost_price' => $variant->purchase_price,
                    'discount_per_item' => $item['discount_per_item'] ?? 0,
                    'total_price' => $lineTotal,
                    'pending_serials' => $status === 'held' && $serials ? $serials : null,
                ]);

                if ($status === 'completed') {
                    SerialService::sell($variant, $saleItem, $serials, "items.{$i}.serials");
                    BatchService::consumeForSale($variant, $saleItem);
                    StockService::decrement($variant, $item['quantity'], 'out', $user, $sale, 'Sale '.$sale->invoice_number);
                }
            }

            if ($status === 'completed' && $sale->customer_id) {
                Customer::where('id', $sale->customer_id)->increment('total_purchases', $grandTotal);
            }

            ActivityLogger::log($user, 'create', 'sales', "Created sale {$sale->invoice_number} ({$status}).");

            return $sale;
            });
            break;
        } catch (QueryException $e) {
            // Two near-simultaneous submissions of the same idempotency key
            // both passed the earlier "not found" check — the unique index
            // caught the race. Return the one that won instead of a 500.
            if ($idempotencyKey && str_contains($e->getMessage(), 'idempotency_key')) {
                $existing = Sale::where('idempotency_key', $idempotencyKey)->first();
                if ($existing) {
                    return new SaleResource($existing->load(['customer', 'cashier', 'items.variant.product']));
                }
            }
            if (str_contains($e->getMessage(), 'invoice_number') && $attempt < $maxAttempts) {
                continue;
            }
            throw $e;
        }
        }

        return new SaleResource($sale->load(['customer', 'cashier', 'items.variant.product']));
    }

    public function show(Request $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }

        return new SaleResource($sale->load(['customer', 'cashier', 'items.variant.product', 'returns.items', 'returns.processor']));
    }

    public function resume(ResumeSaleRequest $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }

        if ($sale->status !== 'held') {
            return response()->json(['message' => 'Only held sales can be resumed.'], 422);
        }

        $validated = $request->validated();
        $user = $request->user();

        DB::transaction(function () use ($sale, $user, $validated) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();

            if ($sale->status !== 'held') {
                throw ValidationException::withMessages([
                    'items' => ['Only held sales can be resumed.'],
                ]);
            }

            $sale->load('items');
            $variants = ProductVariant::withTrashed()
                ->whereIn('id', $sale->items->pluck('variant_id'))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $requestedByVariant = $sale->items->groupBy('variant_id')->map(fn ($rows) => Qty::round($rows->sum('quantity')));

            foreach ($requestedByVariant as $variantId => $requestedQty) {
                $variant = $variants[$variantId];
                if (Qty::round($variant->stock_qty) < $requestedQty) {
                    throw ValidationException::withMessages([
                        'items' => ["Insufficient stock for {$variant->sku}. Available: ".Qty::format($variant->stock_qty).'.'],
                    ]);
                }
            }

            foreach ($sale->items as $i => $item) {
                $variant = $variants[$item->variant_id];
                SerialService::sell($variant, $item, $item->pending_serials ?? [], "items.{$i}.serials");
                BatchService::consumeForSale($variant, $item);
                StockService::decrement($variant, $item->quantity, 'out', $user, $sale, 'Resumed sale '.$sale->invoice_number);
                $item->update(['pending_serials' => null]);
            }

            $paymentReceived = $validated['payment_received'] ?? $sale->grand_total;
            $sale->payment_method = $validated['payment_method'] ?? $sale->payment_method;
            $sale->payment_received = $paymentReceived;
            $sale->change_amount = max(0, $paymentReceived - $sale->grand_total);
            $sale->paid_amount = min($sale->grand_total, $paymentReceived);
            $sale->status = 'completed';
            $sale->syncPaymentStatus();
            $sale->save();

            if ($sale->customer_id) {
                Customer::where('id', $sale->customer_id)->increment('total_purchases', $sale->grand_total);
            }

            ActivityLogger::log($user, 'resume', 'sales', "Resumed held sale {$sale->invoice_number}.");
        });

        return new SaleResource($sale->fresh(['customer', 'cashier', 'items.variant.product']));
    }

    /**
     * Discard a held (unpaid) bill — nothing was taken from stock yet. The
     * POS uses this to reopen an open restaurant order into the cart.
     */
    public function destroy(Request $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }
        if ($sale->status !== 'held') {
            return response()->json(['message' => 'Only held bills can be discarded. Use a return for completed sales.'], 422);
        }

        DB::transaction(function () use ($sale) {
            $sale->items()->delete();
            $sale->delete();
        });
        ActivityLogger::log($request->user(), 'delete', 'sales', "Discarded held bill {$sale->invoice_number}.");

        return response()->json(['message' => 'Held bill discarded.']);
    }

    public function recordPayment(RecordSalePaymentRequest $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }

        $validated = $request->validated();
        $user = $request->user();

        DB::transaction(function () use ($validated, $sale, $user) {
            $locked = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            $due = max(0, $locked->grand_total - $locked->paid_amount);

            if ($validated['amount'] > $due) {
                throw ValidationException::withMessages([
                    'amount' => ["Amount exceeds the remaining due of ".number_format($due, 2).'.'],
                ]);
            }

            $locked->paid_amount += $validated['amount'];
            $locked->syncPaymentStatus();
            $locked->save();

            $via = ! empty($validated['payment_method']) ? " via {$validated['payment_method']}" : '';
            ActivityLogger::log($user, 'payment', 'sales', "Recorded payment of {$validated['amount']}{$via} against sale {$locked->invoice_number}.");
        });

        return new SaleResource($sale->fresh(['customer', 'cashier', 'items.variant.product']));
    }

    private function nextInvoiceNumber(): string
    {
        $next = 1000 + Sale::withTrashed()->count();

        while (Sale::withTrashed()->where('invoice_number', "INV-{$next}")->exists()) {
            $next++;
        }

        return "INV-{$next}";
    }
}
