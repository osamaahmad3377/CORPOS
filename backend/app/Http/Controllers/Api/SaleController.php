<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PreviewSaleRequest;
use App\Http\Requests\RecordSalePaymentRequest;
use App\Http\Requests\ResumeSaleRequest;
use App\Http\Requests\StoreSaleRequest;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Setting;
use App\Services\ActivityLogger;
use App\Services\BatchService;
use App\Services\SaleCompletion;
use App\Services\SalePricing;
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
        $query = Sale::with(['customer', 'cashier', 'waiter', 'rider'])->withCount('items');
        if ($request->filled('waiter_id')) {
            $query->where('waiter_id', $request->integer('waiter_id'));
        }
        if ($request->filled('rider_id')) {
            $query->where('rider_id', $request->integer('rider_id'));
        }
        if ($request->filled('order_type')) {
            $query->where('order_type', $request->string('order_type'));
        }

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
                return new SaleResource($existing->load(['customer', 'cashier', 'waiter', 'rider', 'items.variant.product']));
            }
        }

        // Two near-simultaneous checkouts can compute the same "next"
        // invoice number before either commits — retry a few times with a
        // freshly generated number instead of surfacing a raw 500.
        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        try {
            $sale = DB::transaction(function () use ($validated, $status, $user, $idempotencyKey) {
            $customer = ! empty($validated['customer_id']) ? Customer::find($validated['customer_id']) : null;
            if (! empty($validated['customer_id']) && ! $customer) {
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
                    if ($variant->product?->track_stock !== false && Qty::round($variant->stock_qty) < $requestedQty) {
                        throw ValidationException::withMessages([
                            'items' => ["Insufficient stock for {$variant->sku}. Available: ".Qty::format($variant->stock_qty).'.'],
                        ]);
                    }
                }
            }

            // Price always comes from the catalog, never from the client —
            // otherwise a forged request (or a compromised cashier session)
            // could check out any item at an arbitrary price. SalePricing also
            // applies the price level, running offers and loyalty points.
            $pricing = SalePricing::compute($validated, $variants, $customer, $user);
            $subtotal = $pricing['subtotal'];
            $discountAmount = $pricing['discount_amount'];
            $taxAmount = $pricing['tax_amount'];
            $grandTotal = $pricing['grand_total'];

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
                'waiter_id' => $validated['waiter_id'] ?? null,
                ...self::deliveryFields($validated, $pricing['delivery_fee']),
                'notes' => $validated['notes'] ?? null,
                'price_level' => $pricing['price_level'],
                'points_redeemed' => $pricing['points_redeemed'],
                'points_discount' => $pricing['points_discount'],
            ]);
            $sale->syncPaymentStatus();
            $sale->save();

            foreach ($validated['items'] as $i => $item) {
                $variant = $variants[$item['variant_id']];
                $line = $pricing['lines'][$i];
                $serials = SerialService::clean($item['serials'] ?? [], "items.{$i}.serials");

                $saleItem = SaleItem::create([
                    'sale_id' => $sale->id,
                    'variant_id' => $item['variant_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $line['unit_price'],
                    'cost_price' => $variant->purchase_price,
                    'discount_per_item' => $line['discount_per_item'],
                    'total_price' => $line['total_price'],
                    'promotion_id' => $line['promotion_id'],
                    'promo_discount' => $line['promo_discount'],
                    'pending_serials' => $status === 'held' && $serials ? $serials : null,
                ]);

                if ($status === 'completed') {
                    SerialService::sell($variant, $saleItem, $serials, "items.{$i}.serials");
                    BatchService::consumeForSale($variant, $saleItem);
                    StockService::decrement($variant, $item['quantity'], 'out', $user, $sale, 'Sale '.$sale->invoice_number);
                }
            }

            // restaurant kitchen stock: take each dish's recipe off the ingredients
            if ($status === 'completed') {
                \App\Services\IngredientService::consumeForSale($sale, $user);
            }

            if ($status === 'completed' && $sale->customer_id) {
                Customer::where('id', $sale->customer_id)->increment('total_purchases', $grandTotal);
                SaleCompletion::settleLoyalty($sale);
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
                    return new SaleResource($existing->load(['customer', 'cashier', 'waiter', 'rider', 'items.variant.product']));
                }
            }
            if (str_contains($e->getMessage(), 'invoice_number') && $attempt < $maxAttempts) {
                continue;
            }
            throw $e;
        }
        }

        return new SaleResource($sale->load(['customer', 'cashier', 'waiter', 'rider', 'items.variant.product']));
    }

    public function show(Request $request, Sale $sale)
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403);
        }

        return new SaleResource($sale->load(['customer', 'cashier', 'items.variant.product', 'returns.items', 'returns.processor', 'payments']));
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

        SaleCompletion::completeHeld(
            $sale, $user,
            $validated['payment_method'] ?? null,
            isset($validated['payment_received']) ? (float) $validated['payment_received'] : null,
        );

        return new SaleResource($sale->fresh(['customer', 'cashier', 'waiter', 'rider', 'items.variant.product']));
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

    /**
     * Delete a finished bill for good (owner only, typed "DELETE" to confirm).
     * Everything the bill did is undone: stock, serial numbers and batches
     * come back, kitchen ingredients are put back, the customer's purchases
     * and loyalty points are corrected and its udhaar payments removed. The
     * bill then disappears from bills, reports and the cash drawer. A bill
     * with a return is refused — that money was already given back.
     */
    public function deleteBill(Request $request, Sale $sale)
    {
        $request->validate([
            'confirm' => ['required', 'in:DELETE'],
            'reason' => ['nullable', 'string', 'max:255'],
        ], ['confirm.in' => 'Type DELETE in capital letters to confirm.', 'confirm.required' => 'Type DELETE in capital letters to confirm.']);
        $user = $request->user();

        DB::transaction(function () use ($sale, $user, $request) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($sale->status === 'held') {
                $sale->items()->delete();
                $sale->delete();

                return;
            }
            if ($sale->status === 'returned' || $sale->returns()->exists()) {
                throw ValidationException::withMessages([
                    'confirm' => ['This bill has a return, so it cannot be deleted. The returned money was already given back.'],
                ]);
            }

            $note = 'Deleted bill '.$sale->invoice_number;
            foreach ($sale->items()->get() as $item) {
                $variant = ProductVariant::withTrashed()->lockForUpdate()->find($item->variant_id);
                if (! $variant) {
                    continue;
                }
                \App\Models\ProductSerial::where('sale_item_id', $item->id)->where('status', 'sold')
                    ->update(['status' => 'in_stock', 'sale_item_id' => null, 'sold_at' => null]);
                BatchService::returnForSale($item, (float) $item->quantity);
                StockService::increment($variant, (float) $item->quantity, 'in', $user, $sale, $note);
            }

            // kitchen ingredients the bill used go back
            if (\Illuminate\Support\Facades\Schema::hasTable('ingredient_movements')) {
                foreach (\App\Models\IngredientMovement::where('sale_id', $sale->id)->where('type', 'sale')->get() as $m) {
                    $ingredient = \App\Models\Ingredient::lockForUpdate()->find($m->ingredient_id);
                    if ($ingredient) {
                        \App\Services\IngredientService::move($ingredient, -(float) $m->quantity_change, 'correction', $user, null, $sale->id, $note);
                    }
                }
            }

            if ($sale->customer_id) {
                Customer::whereKey($sale->customer_id)->update([
                    'total_purchases' => DB::raw('MAX(0, total_purchases - '.(float) $sale->grand_total.')'),
                    // points earned on this bill come off, points spent on it come back
                    'loyalty_points' => DB::raw('MAX(0, loyalty_points - '.(int) $sale->points_earned.' + '.(int) $sale->points_redeemed.')'),
                ]);
            }

            \App\Models\SalePayment::where('sale_id', $sale->id)->delete();
            $sale->delete();

            $reason = trim((string) $request->input('reason'));
            ActivityLogger::log($user, 'delete', 'sales', "Deleted bill {$sale->invoice_number} (Rs ".number_format((float) $sale->grand_total, 2).')'.($reason !== '' ? ": {$reason}" : '.'));
        });

        return response()->json(['message' => 'Bill deleted.']);
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

            \App\Models\SalePayment::create([
                'sale_id' => $locked->id,
                'amount' => $validated['amount'],
                'payment_method' => $validated['payment_method'] ?? 'cash',
                'user_id' => $user->id,
            ]);

            $via = ! empty($validated['payment_method']) ? " via {$validated['payment_method']}" : '';
            ActivityLogger::log($user, 'payment', 'sales', "Recorded payment of {$validated['amount']}{$via} against sale {$locked->invoice_number}.");
        });

        return new SaleResource($sale->fresh(['customer', 'cashier', 'waiter', 'rider', 'items.variant.product']));
    }

    /**
     * POST /sales/preview — same body as POST /sales. Returns the exact lines
     * and totals the server would charge (price level, offers, points) without
     * saving anything or touching stock, so the POS can show them before payment.
     */
    public function preview(PreviewSaleRequest $request)
    {
        $data = $request->validated();
        $user = $request->user();

        $customer = ! empty($data['customer_id']) ? Customer::find($data['customer_id']) : null;
        $variants = ProductVariant::with('product')->whereIn('id', collect($data['items'])->pluck('variant_id')->unique())->get()->keyBy('id');

        // Without a tax_amount from the POS, work tax out from the shop's tax
        // setting the same way the POS does: % of (subtotal - discounts).
        $taxFromSettings = ! array_key_exists('tax_amount', $data) || $data['tax_amount'] === null;
        $taxSettings = Setting::group('tax');
        $taxPercent = ($taxSettings['tax.enabled'] ?? '0') === '1' ? (float) ($taxSettings['tax.percentage'] ?? 0) : 0.0;

        $pricing = SalePricing::compute($data, $variants, $customer, $user, $taxFromSettings ? 0.0 : null);
        if ($taxFromSettings && $taxPercent > 0) {
            $tax = round(max(0, $pricing['subtotal'] - $pricing['discount_amount']) * $taxPercent / 100, 2);
            $pricing = SalePricing::compute($data, $variants, $customer, $user, $tax);
        }

        $r2 = fn ($v) => round((float) $v, 2);
        $loyalty = $pricing['loyalty'];
        $maxRedeemable = 0;
        if ($loyalty['enabled'] && $customer && $loyalty['point_value'] > 0) {
            $billBeforePoints = $pricing['subtotal'] - $pricing['sale_discount'] + $pricing['tax_amount'];
            $maxRedeemable = (int) min((int) $customer->loyalty_points, floor(round(max(0, $billBeforePoints) / $loyalty['point_value'], 6)));
            if ($maxRedeemable < $loyalty['min_redeem']) {
                $maxRedeemable = 0;
            }
        }

        return response()->json(['data' => [
            'price_level' => $pricing['price_level'],
            'customer' => $customer ? [
                'id' => $customer->id,
                'name' => $customer->name,
                'price_level' => $customer->price_level ?: 'retail',
                'loyalty_points' => (int) $customer->loyalty_points,
            ] : null,
            'items' => collect($pricing['lines'])->map(function ($l) use ($variants, $r2) {
                $v = $variants[$l['variant_id']];

                return [
                    'variant_id' => $l['variant_id'],
                    'product_name' => $v->product?->name,
                    'quantity' => $l['quantity'],
                    'retail_price' => $r2($l['retail_price']),
                    'unit_price' => $r2($l['unit_price']),
                    'line_subtotal' => $r2($l['line_subtotal']),
                    'manual_discount' => $r2($l['manual_discount']),
                    'promo_discount' => $r2($l['promo_discount']),
                    'promotion_id' => $l['promotion_id'],
                    'promotion_name' => $l['promotion_name'],
                    'discount_per_item' => $r2($l['discount_per_item']),
                    'total_price' => $r2($l['total_price']),
                    'stock_qty' => (float) $v->stock_qty,
                ];
            })->values(),
            'items_total' => $r2($pricing['raw_subtotal']),
            'line_discount' => $r2($pricing['line_discount']),
            'promo_discount' => $r2($pricing['promo_discount']),
            'subtotal' => $r2($pricing['subtotal']),
            'discount_amount' => $r2($pricing['sale_discount']),
            'points_redeemed' => $pricing['points_redeemed'],
            'points_discount' => $r2($pricing['points_discount']),
            'total_discount' => $r2($pricing['discount_amount']),
            'tax_amount' => $r2($pricing['tax_amount']),
            'delivery_fee' => $r2($pricing['delivery_fee']),
            'tax_from_settings' => $taxFromSettings,
            'grand_total' => $r2($pricing['grand_total']),
            'points_earned' => $pricing['points_earned'],
            'loyalty' => [
                'enabled' => $loyalty['enabled'],
                'points_per_100' => $loyalty['points_per_100'],
                'point_value' => $loyalty['point_value'],
                'min_redeem' => $loyalty['min_redeem'],
                'customer_points' => $customer ? (int) $customer->loyalty_points : null,
                'max_redeemable' => $maxRedeemable,
            ],
        ]]);
    }

    /** Delivery details saved on a delivery order (nothing for dine-in / takeaway). */
    private static function deliveryFields(array $v, float $fee): array
    {
        if (($v['order_type'] ?? null) !== 'delivery') {
            return [];
        }
        $clean = fn ($k) => ($x = trim((string) ($v[$k] ?? ''))) === '' ? null : $x;
        $rider = $v['rider_id'] ?? null;

        return [
            'delivery_fee' => $fee,
            'delivery_name' => $clean('delivery_name'),
            'delivery_phone' => DeliveryController::phone($v['delivery_phone'] ?? null),
            'delivery_address' => $clean('delivery_address'),
            'delivery_area' => $clean('delivery_area'),
            // an order opened again to add items keeps its rider
            'rider_id' => $rider,
            'delivery_status' => $rider ? 'out' : 'pending',
            'dispatched_at' => $rider ? now() : null,
        ];
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
