<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Restaurant table actions on open (held, unpaid) orders: move to another
 * table, merge orders into one bill, split a bill. Nothing has been taken
 * from stock yet for held orders, so these only move lines and money; every
 * line keeps its exact price, and bill-level discount / tax are shared in
 * proportion so the totals always add up.
 */
class TableActionController extends Controller
{
    private const KITCHEN_ORDER = ['new' => 0, 'preparing' => 1, 'ready' => 2, 'served' => 3];

    private function guard(Request $request, Sale $sale): void
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403, 'This order belongs to another cashier.');
        }
        if ($sale->status !== 'held') {
            abort(response()->json(['message' => 'Only open (unpaid) orders can be changed.'], 422));
        }
        // a delivery has its own address, charge and rider — keep it whole
        if ($sale->order_type === 'delivery') {
            abort(response()->json(['message' => "{$sale->invoice_number} is a delivery order. Delivery orders can't be moved, merged or split."], 422));
        }
    }

    private function busyOn(string $table, ?int $except = null): ?Sale
    {
        return Sale::where('status', 'held')->where('order_type', 'dine_in')
            ->whereRaw('lower(table_no) = ?', [mb_strtolower(trim($table))])
            ->when($except, fn ($q) => $q->where('id', '!=', $except))->first();
    }

    private function fresh(Sale $sale)
    {
        return new SaleResource($sale->fresh(['customer', 'cashier', 'waiter', 'items.variant.product']));
    }

    /** Move an order to another (free) table; a takeaway order becomes dine-in. */
    public function move(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        $data = $request->validate(['table_no' => ['required', 'string', 'max:20']]);
        $to = trim($data['table_no']);
        if ($other = $this->busyOn($to, $sale->id)) {
            throw ValidationException::withMessages(['table_no' => "Table {$to} already has an open order ({$other->invoice_number}). Use Merge to put them on one bill."]);
        }
        $from = $sale->table_no;
        $sale->update(['table_no' => $to, 'order_type' => 'dine_in']);
        ActivityLogger::log($request->user(), 'update', 'sales', "Moved order {$sale->invoice_number} from ".($from ? "table {$from}" : 'takeaway')." to table {$to}.");

        return $this->fresh($sale);
    }

    /** Put other open orders on this order's bill (their items move here). */
    public function merge(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        $data = $request->validate([
            'from' => ['required', 'array', 'min:1', 'max:20'],
            'from.*' => ['required', 'string', 'distinct'],
        ]);
        $sources = Sale::whereIn('invoice_number', $data['from'])->where('id', '!=', $sale->id)->get();
        if ($sources->count() !== count(array_diff($data['from'], [$sale->invoice_number]))) {
            throw ValidationException::withMessages(['from' => 'One of these orders was not found (maybe it was already paid).']);
        }

        DB::transaction(function () use ($sources, $sale, $request) {
            foreach ($sources as $src) {
                $this->guard($request, $src);
                SaleItem::where('sale_id', $src->id)->update(['sale_id' => $sale->id]);
                foreach (['subtotal', 'discount_amount', 'tax_amount', 'grand_total', 'points_discount'] as $f) {
                    $sale->{$f} = round((float) $sale->{$f} + (float) $src->{$f}, 2);
                }
                $sale->points_redeemed = (int) $sale->points_redeemed + (int) $src->points_redeemed;
                $sale->customer_id ??= $src->customer_id;
                $sale->waiter_id ??= $src->waiter_id;
                if ($src->notes) {
                    $sale->notes = trim(($sale->notes ? $sale->notes.' | ' : '').$src->notes);
                }
                // the merged order is as "behind" as its slowest part
                $a = self::KITCHEN_ORDER[$sale->kitchen_status ?: 'new'] ?? 0;
                $b = self::KITCHEN_ORDER[$src->kitchen_status ?: 'new'] ?? 0;
                if ($b < $a) {
                    $sale->kitchen_status = $src->kitchen_status ?: 'new';
                }
                $src->delete();
            }
            $sale->save();
        });
        $list = $sources->map(fn ($s) => $s->table_no ? "table {$s->table_no}" : $s->invoice_number)->implode(', ');
        ActivityLogger::log($request->user(), 'update', 'sales', "Merged {$list} into order {$sale->invoice_number}.");

        return $this->fresh($sale);
    }

    /**
     * Move chosen items (or part of a line, e.g. 1 of 3) to a new bill —
     * for guests who pay separately. items: [{ id, quantity }].
     */
    public function split(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'table_no' => ['nullable', 'string', 'max:20'],
        ]);
        if ((int) $sale->points_redeemed > 0) {
            throw ValidationException::withMessages(['items' => 'This bill uses loyalty points. Remove the points first, then split it.']);
        }
        $lines = $sale->items()->get()->keyBy('id');
        $moving = [];
        foreach ($data['items'] as $it) {
            $line = $lines[$it['id']] ?? null;
            if (! $line) {
                throw ValidationException::withMessages(['items' => 'An item is not on this bill any more. Close and open the table again.']);
            }
            $q = round((float) $it['quantity'], 3);
            if ($q > (float) $line->quantity + 0.0005) {
                throw ValidationException::withMessages(['items' => 'You cannot move more than is on the bill.']);
            }
            $moving[$line->id] = min($q, (float) $line->quantity);
        }
        $left = $lines->sum(fn ($l) => (float) $l->quantity - ($moving[$l->id] ?? 0));
        if ($left <= 0.0005) {
            throw ValidationException::withMessages(['items' => 'Leave at least one item on this bill (to move everything, use Move table).']);
        }

        $new = DB::transaction(function () use ($sale, $lines, $moving, $data, $request) {
            $origSubtotal = (float) $sale->subtotal;
            $new = $sale->replicate(['invoice_number', 'idempotency_key', 'created_at', 'updated_at']);
            $new->invoice_number = $this->nextInvoiceNumber();
            $new->sale_date = now();
            $new->table_no = $data['table_no'] ?? $sale->table_no;
            $new->subtotal = 0;
            $new->discount_amount = 0;
            $new->tax_amount = 0;
            $new->grand_total = 0;
            $new->points_redeemed = 0;
            $new->points_discount = 0;
            $new->save();

            $moved = 0.0;
            foreach ($moving as $id => $q) {
                $line = $lines[$id];
                $full = abs($q - (float) $line->quantity) < 0.0005;
                if ($full) {
                    $line->update(['sale_id' => $new->id]);
                    $moved += (float) $line->total_price;
                } else {
                    $ratio = $q / (float) $line->quantity;
                    $part = round((float) $line->total_price * $ratio, 2);
                    $promo = round((float) $line->promo_discount * $ratio, 2);
                    $copy = $line->replicate(['created_at', 'updated_at']);
                    $copy->sale_id = $new->id;
                    $copy->quantity = $q;
                    $copy->total_price = $part;
                    $copy->promo_discount = $promo;
                    $copy->save();
                    $line->update([
                        'quantity' => round((float) $line->quantity - $q, 3),
                        'total_price' => round((float) $line->total_price - $part, 2),
                        'promo_discount' => round((float) $line->promo_discount - $promo, 2),
                    ]);
                    $moved += $part;
                }
            }

            // share the bill-level discount and tax in proportion
            $share = $origSubtotal > 0 ? $moved / $origSubtotal : 0;
            $d = round((float) $sale->discount_amount * $share, 2);
            $tx = round((float) $sale->tax_amount * $share, 2);
            $new->subtotal = round($moved, 2);
            $new->discount_amount = $d;
            $new->tax_amount = $tx;
            $new->grand_total = round($moved - $d + $tx, 2);
            $new->save();

            $sale->subtotal = round($origSubtotal - $moved, 2);
            $sale->discount_amount = round((float) $sale->discount_amount - $d, 2);
            $sale->tax_amount = round((float) $sale->tax_amount - $tx, 2);
            $sale->grand_total = round((float) $sale->subtotal - (float) $sale->discount_amount + (float) $sale->tax_amount, 2);
            $sale->save();

            ActivityLogger::log($request->user(), 'update', 'sales', "Split order {$sale->invoice_number}: new bill {$new->invoice_number}.");

            return $new;
        });

        return response()->json(['original' => $this->fresh($sale), 'new' => $this->fresh($new)]);
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
