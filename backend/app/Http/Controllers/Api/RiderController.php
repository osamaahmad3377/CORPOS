<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Rider;
use App\Models\Sale;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Delivery riders: the list used when sending an order out, plus each
 * rider's deliveries, sales, delivery charges and average time over a period.
 */
class RiderController extends Controller
{
    public function index(Request $request)
    {
        $from = $request->date('from') ?? now()->startOfDay();
        $to = ($request->date('to') ?? now())->copy()->endOfDay();

        $done = Sale::whereNotNull('rider_id')->where('order_type', 'delivery')->where('delivery_status', 'delivered')
            ->whereBetween('delivered_at', [$from, $to])
            ->get(['rider_id', 'grand_total', 'refunded_amount', 'delivery_fee', 'dispatched_at', 'delivered_at'])
            ->groupBy('rider_id');
        $out = Sale::whereNotNull('rider_id')->where('order_type', 'delivery')->where('delivery_status', 'out')
            ->whereIn('status', ['held', 'completed'])
            ->get(['rider_id', 'grand_total', 'paid_amount'])->groupBy('rider_id');

        $q = Rider::query()->orderBy('name');
        if ($request->boolean('active')) {
            $q->where('is_active', true);
        }

        return response()->json([
            'data' => $q->get()->map(function (Rider $r) use ($done, $out) {
                $d = $done[$r->id] ?? collect();
                $o = $out[$r->id] ?? collect();
                $times = $d->filter(fn ($s) => $s->dispatched_at && $s->delivered_at)
                    ->map(fn ($s) => $s->dispatched_at->diffInMinutes($s->delivered_at));

                return [
                    'id' => $r->id,
                    'name' => $r->name,
                    'phone' => $r->phone,
                    'is_active' => $r->is_active,
                    'deliveries' => $d->count(),
                    'sales' => round($d->sum(fn ($s) => (float) $s->grand_total - (float) $s->refunded_amount), 2),
                    'fees' => round($d->sum(fn ($s) => (float) $s->delivery_fee), 2),
                    'avg_minutes' => $times->isEmpty() ? null : (int) round($times->avg()),
                    'out_now' => $o->count(),
                    'cash_to_collect' => round($o->sum(fn ($s) => max(0, (float) $s->grand_total - (float) $s->paid_amount)), 2),
                ];
            })->values(),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]);
    }

    private function rules(?Rider $r = null): array
    {
        return [
            'name' => ['required', 'string', 'max:80', Rule::unique('riders', 'name')->ignore($r?->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $r = Rider::create(['name' => trim($data['name']), 'phone' => $data['phone'] ?? null, 'is_active' => $data['is_active'] ?? true]);
        ActivityLogger::log($request->user(), 'create', 'riders', "Added rider {$r->name}.");

        return response()->json(['data' => $r], 201);
    }

    public function update(Request $request, Rider $rider)
    {
        $data = $request->validate($this->rules($rider));
        if (isset($data['is_active']) && ! $data['is_active'] && $rider->sales()->where('delivery_status', 'out')->exists()) {
            return response()->json(['message' => "{$rider->name} still has orders out for delivery. Settle them first."], 422);
        }
        $rider->update(['name' => trim($data['name']), 'phone' => $data['phone'] ?? null, 'is_active' => $data['is_active'] ?? $rider->is_active]);

        return response()->json(['data' => $rider]);
    }

    /** Riders with deliveries are switched off instead, so old bills keep the name. */
    public function destroy(Request $request, Rider $rider)
    {
        if ($rider->sales()->where('delivery_status', 'out')->exists()) {
            return response()->json(['message' => "{$rider->name} still has orders out for delivery. Settle them first."], 422);
        }
        if ($rider->sales()->exists()) {
            $rider->update(['is_active' => false]);

            return response()->json(['ok' => true, 'deactivated' => true]);
        }
        $name = $rider->name;
        $rider->delete();
        ActivityLogger::log($request->user(), 'delete', 'riders', "Removed rider {$name}.");

        return response()->json(['ok' => true]);
    }
}
