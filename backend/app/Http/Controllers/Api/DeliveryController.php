<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Rider;
use App\Models\Sale;
use App\Services\ActivityLogger;
use App\Services\SaleCompletion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Restaurant deliveries. A delivery order moves:
 *   pending   — in the kitchen / ready, waiting for a rider
 *   out       — the rider has it (dispatched_at)
 *   delivered — handed over (delivered_at); an unpaid order is paid here
 * Cash on delivery: the rider brings the money back and the counter marks the
 * order delivered (or settles all of a rider's orders at once).
 */
class DeliveryController extends Controller
{
    private const WITH = ['customer', 'cashier', 'waiter', 'rider'];

    /** Same phone written two ways ("0300-1234567", "0300 1234567") matches. */
    public static function phone(?string $p): ?string
    {
        $p = preg_replace('/[^\d+]/', '', (string) $p);

        return $p === '' ? null : $p;
    }

    private function scoped(Request $request)
    {
        $q = Sale::with(self::WITH)->withCount('items')->where('order_type', 'delivery');
        if (! $request->user()->hasPermission('sales.view_all')) {
            $q->where('cashier_id', $request->user()->id);
        }

        return $q;
    }

    private function guard(Request $request, Sale $sale): void
    {
        if (! $request->user()->hasPermission('sales.view_all') && $sale->cashier_id !== $request->user()->id) {
            abort(403, 'This order belongs to another cashier.');
        }
        if ($sale->order_type !== 'delivery') {
            abort(response()->json(['message' => "{$sale->invoice_number} is not a delivery order."], 422));
        }
        if (! in_array($sale->status, ['held', 'completed'], true)) {
            abort(response()->json(['message' => "{$sale->invoice_number} can no longer be changed."], 422));
        }
    }

    public function index(Request $request)
    {
        $active = $this->scoped($request)->whereIn('delivery_status', ['pending', 'out'])
            ->whereIn('status', ['held', 'completed'])->orderBy('created_at')->get();
        $today = $this->scoped($request)->where('delivery_status', 'delivered')
            ->where('delivered_at', '>=', now()->startOfDay())->orderByDesc('delivered_at')->limit(100)->get();

        $toCollect = fn ($orders) => round($orders->sum(fn (Sale $s) => max(0, (float) $s->grand_total - (float) $s->paid_amount)), 2);
        $out = $active->where('delivery_status', 'out');
        $riders = Rider::where('is_active', true)->orderBy('name')->get()->map(function (Rider $r) use ($out, $today, $toCollect) {
            $mine = $out->where('rider_id', $r->id);

            return [
                'id' => $r->id,
                'name' => $r->name,
                'phone' => $r->phone,
                'out' => $mine->count(),
                'cash_to_collect' => $toCollect($mine),
                'delivered_today' => $today->where('rider_id', $r->id)->count(),
            ];
        })->values();

        return response()->json([
            'active' => SaleResource::collection($active),
            'delivered' => SaleResource::collection($today),
            'riders' => $riders,
            'stats' => [
                'pending' => $active->where('delivery_status', 'pending')->count(),
                'out' => $out->count(),
                'delivered_today' => $today->count(),
                'sales_today' => round($today->sum(fn (Sale $s) => (float) $s->grand_total - (float) $s->refunded_amount), 2),
                'fees_today' => round($today->sum(fn (Sale $s) => (float) $s->delivery_fee), 2),
                'cash_with_riders' => $toCollect($out),
                // order taken -> handed over, today
                'avg_minutes' => ($avg = $today->filter(fn (Sale $s) => $s->delivered_at && $s->created_at)->avg(fn (Sale $s) => $s->created_at->diffInMinutes($s->delivered_at))) === null ? null : (int) round($avg),
            ],
        ]);
    }

    /** A returning customer: their name, last address and area from the last delivery. */
    public function lookup(Request $request)
    {
        $phone = self::phone($request->query('phone'));
        if (! $phone || strlen(ltrim($phone, '+')) < 4) {
            return response()->json(['found' => false]);
        }
        $last = Sale::where('delivery_phone', $phone)->latest('id')->first();
        $customer = Customer::where('phone', $phone)->first()
            ?? Customer::whereRaw("replace(replace(phone, '-', ''), ' ', '') = ?", [$phone])->first();
        if (! $last && ! $customer) {
            return response()->json(['found' => false]);
        }

        return response()->json([
            'found' => true,
            'name' => $last?->delivery_name ?? $customer?->name,
            'address' => $last?->delivery_address ?? $customer?->address,
            'area' => $last?->delivery_area,
            'orders' => Sale::where('delivery_phone', $phone)->where('status', 'completed')->count(),
            'last_at' => $last?->created_at,
            'customer' => $customer ? ['id' => $customer->id, 'name' => $customer->name, 'phone' => $customer->phone] : null,
        ]);
    }

    /** Hand the order to a rider (or give it to another rider). */
    public function send(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        $data = $request->validate(['rider_id' => ['required', 'integer', Rule::exists('riders', 'id')->where('is_active', true)]]);
        if (! in_array($sale->delivery_status, ['pending', 'out', null], true)) {
            throw ValidationException::withMessages(['rider_id' => "{$sale->invoice_number} is already delivered."]);
        }
        $rider = Rider::find($data['rider_id']);
        // the food has left the kitchen
        $sale->update(['rider_id' => $rider->id, 'delivery_status' => 'out', 'dispatched_at' => now(), 'kitchen_status' => 'served']);
        ActivityLogger::log($request->user(), 'update', 'sales', "Sent delivery {$sale->invoice_number} with rider {$rider->name}.");

        return new SaleResource($sale->fresh(self::WITH));
    }

    /** Delivered: an unpaid order is paid now (the money the rider brought back). */
    public function delivered(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        $data = $request->validate([
            'payment_method' => ['nullable', 'string', Rule::in(array_keys(config('pos.payment_methods')))],
            'payment_received' => ['nullable', 'numeric', 'min:0'],
        ]);
        if ($sale->delivery_status === 'delivered') {
            throw ValidationException::withMessages(['payment_method' => "{$sale->invoice_number} is already delivered."]);
        }

        DB::transaction(function () use ($sale, $data, $request) {
            if ($sale->status === 'held') {
                SaleCompletion::completeHeld($sale, $request->user(), $data['payment_method'] ?? 'cash',
                    isset($data['payment_received']) ? (float) $data['payment_received'] : null, 'deliver');
            } else {
                ActivityLogger::log($request->user(), 'update', 'sales', "Delivered {$sale->invoice_number}.");
            }
            Sale::whereKey($sale->id)->update(['delivery_status' => 'delivered', 'delivered_at' => now()]);
        });

        return new SaleResource($sale->fresh([...self::WITH, 'items.variant.product']));
    }

    /** Could not deliver (customer not home, wrong address): back to waiting. */
    public function returned(Request $request, Sale $sale)
    {
        $this->guard($request, $sale);
        if ($sale->delivery_status !== 'out') {
            throw ValidationException::withMessages(['rider_id' => "{$sale->invoice_number} is not out for delivery."]);
        }
        $rider = $sale->rider?->name;
        $sale->update(['rider_id' => null, 'delivery_status' => 'pending', 'dispatched_at' => null]);
        ActivityLogger::log($request->user(), 'update', 'sales', "Delivery {$sale->invoice_number} came back".($rider ? " with {$rider}" : '').' (not delivered).');

        return new SaleResource($sale->fresh(self::WITH));
    }

    /**
     * The rider is back: every order they still have is marked delivered and
     * the unpaid ones are paid in cash — one step for the whole trip.
     */
    public function settle(Request $request, Rider $rider)
    {
        $data = $request->validate(['invoices' => ['nullable', 'array'], 'invoices.*' => ['string']]);
        $orders = $this->scoped($request)->where('rider_id', $rider->id)->where('delivery_status', 'out')
            ->whereIn('status', ['held', 'completed'])
            ->when(! empty($data['invoices']), fn ($q) => $q->whereIn('invoice_number', $data['invoices']))
            ->orderBy('dispatched_at')->get();
        if ($orders->isEmpty()) {
            throw ValidationException::withMessages(['invoices' => "{$rider->name} has no orders out for delivery."]);
        }

        $cash = 0.0;
        DB::transaction(function () use ($orders, $request, &$cash) {
            foreach ($orders as $sale) {
                if ($sale->status === 'held') {
                    $cash += (float) $sale->grand_total;
                    SaleCompletion::completeHeld($sale, $request->user(), 'cash', null, 'deliver');
                }
                Sale::whereKey($sale->id)->update(['delivery_status' => 'delivered', 'delivered_at' => now()]);
            }
        });
        ActivityLogger::log($request->user(), 'payment', 'sales', "Settled rider {$rider->name}: {$orders->count()} deliveries, cash ".number_format($cash, 2).'.');

        return response()->json(['ok' => true, 'orders' => $orders->count(), 'cash' => round($cash, 2)]);
    }
}
