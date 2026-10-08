<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuotationRequest;
use App\Http\Resources\QuotationResource;
use App\Models\ProductVariant;
use App\Models\Quotation;
use App\Models\Sale;
use App\Models\Setting;
use App\Services\ActivityLogger;
use App\Support\Qty;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Quotations / estimates. Prices come from the catalog (like sales) and
 * nothing here changes stock or money. The POS loads a quote into the cart,
 * completes a normal sale and then calls markConverted().
 */
class QuotationController extends Controller
{
    private const DETAIL = ['customer', 'creator', 'convertedSale', 'items.variant.product'];

    public function index(Request $request)
    {
        $query = Quotation::with(['customer', 'creator', 'convertedSale'])->withCount('items');

        if ($request->filled('status') && in_array($request->string('status')->toString(), [...Quotation::STATUSES, 'open'], true)) {
            $query->effectiveStatus($request->string('status')->toString());
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->integer('customer_id'));
        }

        if ($request->filled('search')) {
            $raw = $request->string('search')->trim()->toString();
            $term = '%'.$raw.'%';
            $digits = preg_replace('/\D/', '', $raw);
            $query->where(function ($q) use ($term, $digits) {
                $q->where('quote_number', 'like', $term)
                    ->orWhere('customer_name', 'like', $term)
                    ->orWhere('customer_phone', 'like', $term)
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', $term)->orWhere('phone', 'like', $term));
                if (strlen($digits) >= 3) {
                    $q->orWhere('quote_number', 'like', "%{$digits}%");
                }
            });
        }

        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->date('start_date'));
        }
        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->date('end_date'));
        }

        $perPage = min(max($request->integer('per_page', 20), 1), 200);

        return QuotationResource::collection($query->orderByDesc('id')->paginate($perPage));
    }

    public function store(StoreQuotationRequest $request)
    {
        $validated = $request->validated();
        $user = $request->user();

        for ($attempt = 1; ; $attempt++) {
            try {
                $quotation = DB::transaction(function () use ($validated, $user) {
                    $totals = $this->priceLines($validated['items'], $validated['discount_amount'] ?? 0);

                    $quotation = Quotation::create([
                        'quote_number' => $this->nextQuoteNumber(),
                        'customer_id' => $validated['customer_id'] ?? null,
                        'customer_name' => $this->clean($validated['customer_name'] ?? null),
                        'customer_phone' => $this->clean($validated['customer_phone'] ?? null),
                        'valid_until' => $validated['valid_until'] ?? now()->addDays(7)->toDateString(),
                        'subtotal' => $totals['subtotal'],
                        'discount_amount' => $totals['discount'],
                        'tax_amount' => $totals['tax'],
                        'grand_total' => $totals['grand'],
                        'notes' => $this->clean($validated['notes'] ?? null),
                        'status' => $validated['status'] ?? 'draft',
                        'created_by' => $user->id,
                    ]);
                    $quotation->items()->createMany($totals['lines']);

                    ActivityLogger::log($user, 'create', 'quotations', "Created quotation {$quotation->quote_number} (Rs {$totals['grand']}).");

                    return $quotation;
                });
                break;
            } catch (QueryException $e) {
                // two quotes saved at the same moment got the same number — try the next one
                if ($attempt < 3 && str_contains($e->getMessage(), 'quote_number')) {
                    continue;
                }
                throw $e;
            }
        }

        return (new QuotationResource($quotation->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function show(Quotation $quotation)
    {
        return new QuotationResource($quotation->load(self::DETAIL));
    }

    public function update(StoreQuotationRequest $request, Quotation $quotation)
    {
        if ($quotation->status === 'converted') {
            return response()->json(['message' => 'This quotation was already turned into a sale and cannot be changed.'], 422);
        }

        $validated = $request->validated();
        $user = $request->user();

        DB::transaction(function () use ($validated, $quotation) {
            $quotation = Quotation::whereKey($quotation->id)->lockForUpdate()->firstOrFail();
            $fields = [];

            foreach (['customer_id', 'valid_until'] as $k) {
                if (array_key_exists($k, $validated)) {
                    $fields[$k] = $validated[$k];
                }
            }
            foreach (['customer_name', 'customer_phone', 'notes'] as $k) {
                if (array_key_exists($k, $validated)) {
                    $fields[$k] = $this->clean($validated[$k]);
                }
            }
            if (! empty($validated['status'])) {
                $fields['status'] = $validated['status'];
            }

            if (array_key_exists('items', $validated) || array_key_exists('discount_amount', $validated)) {
                $quotation->load('items');
                // keep the price already quoted for items that stay on the quote;
                // newly added items get today's catalog price
                $keep = $quotation->items->pluck('unit_price', 'variant_id')->map(fn ($p) => (float) $p)->all();
                $items = $validated['items'] ?? $quotation->items->map(fn ($i) => [
                    'variant_id' => $i->variant_id, 'quantity' => $i->quantity, 'discount_per_item' => $i->discount_per_item,
                ])->all();
                $discount = $validated['discount_amount'] ?? (float) $quotation->discount_amount;
                $totals = $this->priceLines($items, $discount, $keep);

                $quotation->items()->delete();
                $quotation->items()->createMany($totals['lines']);
                $fields += [
                    'subtotal' => $totals['subtotal'],
                    'discount_amount' => $totals['discount'],
                    'tax_amount' => $totals['tax'],
                    'grand_total' => $totals['grand'],
                ];
            }

            $quotation->update($fields);
        });

        ActivityLogger::log($user, 'update', 'quotations', "Updated quotation {$quotation->quote_number}.");

        return new QuotationResource($quotation->fresh(self::DETAIL));
    }

    public function destroy(Request $request, Quotation $quotation)
    {
        if ($quotation->status === 'converted') {
            return response()->json(['message' => 'This quotation was already turned into a sale and cannot be deleted.'], 422);
        }

        DB::transaction(function () use ($quotation) {
            $quotation->items()->delete();
            $quotation->delete();
        });
        ActivityLogger::log($request->user(), 'delete', 'quotations', "Deleted quotation {$quotation->quote_number}.");

        return response()->json(['message' => 'Quotation deleted.']);
    }

    /** POST /quotations/{id}/mark-converted { invoice_number } — called by the POS after the sale is saved. */
    public function markConverted(Request $request, Quotation $quotation)
    {
        $validated = $request->validate([
            'invoice_number' => ['required', 'string', 'max:50'],
        ]);

        $sale = Sale::where('invoice_number', $validated['invoice_number'])->first();
        if (! $sale) {
            throw ValidationException::withMessages(['invoice_number' => ['That bill number was not found.']]);
        }

        if ($quotation->status === 'converted') {
            if ((int) $quotation->converted_sale_id === (int) $sale->id) {
                return new QuotationResource($quotation->load(self::DETAIL)); // retried call — already done
            }

            return response()->json(['message' => 'This quotation was already turned into a sale.'], 422);
        }

        $quotation->update([
            'status' => 'converted',
            'converted_sale_id' => $sale->id,
            'converted_at' => now(),
        ]);
        ActivityLogger::log($request->user(), 'convert', 'quotations', "Quotation {$quotation->quote_number} turned into sale {$sale->invoice_number}.");

        return new QuotationResource($quotation->fresh(self::DETAIL));
    }

    /**
     * Price every line from the catalog (or the kept price) and work out the
     * totals the same way the POS does: line = price × qty − line discount,
     * tax (when switched on) on the total after the bill discount.
     *
     * @param  array<int, float>  $keepPrices  variant_id => price to keep
     */
    private function priceLines(array $items, float|int|string|null $discount, array $keepPrices = []): array
    {
        $variantIds = collect($items)->pluck('variant_id')->unique();
        $variants = ProductVariant::with('product')->whereIn('id', $variantIds)->get()->keyBy('id');

        $lines = [];
        $subtotal = 0.0;
        foreach (array_values($items) as $i => $item) {
            $variant = $variants[$item['variant_id']] ?? null;
            if (! $variant || ! $variant->product || $variant->product->trashed()) {
                throw ValidationException::withMessages(["items.{$i}.variant_id" => ['One or more items are no longer available.']]);
            }

            $quantity = Qty::round($item['quantity']);
            Qty::assertAllowed($variant, $quantity, "items.{$i}.quantity");

            $unitPrice = round($keepPrices[$variant->id] ?? (float) $variant->selling_price, 2);
            $lineDiscount = round((float) ($item['discount_per_item'] ?? 0), 2);
            $lineTotal = round($unitPrice * $quantity - $lineDiscount, 2);
            if ($lineTotal < 0) {
                throw ValidationException::withMessages(["items.{$i}.discount_per_item" => ["Discount on {$variant->sku} is more than its total."]]);
            }

            $subtotal += $lineTotal;
            $lines[] = [
                'variant_id' => $variant->id,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'discount_per_item' => $lineDiscount,
                'total_price' => $lineTotal,
            ];
        }

        $subtotal = round($subtotal, 2);
        $discount = round((float) ($discount ?? 0), 2);
        if ($discount > $subtotal + 0.001) {
            throw ValidationException::withMessages(['discount_amount' => ['Discount cannot be more than the total.']]);
        }

        $tax = 0.0;
        if (Setting::where('key', 'tax.enabled')->value('value') === '1') {
            $percent = (float) Setting::where('key', 'tax.percentage')->value('value');
            $tax = round(($subtotal - $discount) * $percent) / 100;
        }

        return [
            'lines' => $lines,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax' => round($tax, 2),
            'grand' => round($subtotal - $discount + $tax, 2),
        ];
    }

    private function nextQuoteNumber(): string
    {
        $last = Quotation::orderByDesc('id')->value('quote_number');
        $next = max(1001, ((int) preg_replace('/\D/', '', (string) $last)) + 1);

        while (Quotation::where('quote_number', "QT-{$next}")->exists()) {
            $next++;
        }

        return "QT-{$next}";
    }

    private function clean(?string $v): ?string
    {
        $v = trim((string) $v);

        return $v === '' ? null : $v;
    }
}
