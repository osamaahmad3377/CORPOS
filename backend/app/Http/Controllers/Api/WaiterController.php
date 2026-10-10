<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Waiter;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Restaurant waiters: the list used by the waiter picker on the order screen,
 * plus each waiter's orders and sales (today and over a period).
 */
class WaiterController extends Controller
{
    public function index(Request $request)
    {
        $from = $request->date('from') ?? now()->startOfDay();
        $to = ($request->date('to') ?? now())->copy()->endOfDay();
        $stats = DB::table('sales')->whereNotNull('waiter_id')->whereNull('deleted_at')
            ->where('status', 'completed')->whereBetween('sale_date', [$from, $to])
            ->groupBy('waiter_id')
            ->selectRaw('waiter_id, COUNT(*) as orders, SUM(grand_total - COALESCE(refunded_amount, 0)) as sales')
            ->get()->keyBy('waiter_id');
        $open = DB::table('sales')->whereNotNull('waiter_id')->whereNull('deleted_at')->where('status', 'held')
            ->groupBy('waiter_id')->selectRaw('waiter_id, COUNT(*) as n')->pluck('n', 'waiter_id');

        $q = Waiter::query()->orderBy('name');
        if ($request->boolean('active')) {
            $q->where('is_active', true);
        }

        return response()->json([
            'data' => $q->get()->map(fn (Waiter $w) => [
                'id' => $w->id,
                'name' => $w->name,
                'phone' => $w->phone,
                'is_active' => $w->is_active,
                'orders' => (int) ($stats[$w->id]->orders ?? 0),
                'sales' => round((float) ($stats[$w->id]->sales ?? 0), 2),
                'open_orders' => (int) ($open[$w->id] ?? 0),
            ])->values(),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]);
    }

    private function rules(?Waiter $w = null): array
    {
        return [
            'name' => ['required', 'string', 'max:80', Rule::unique('waiters', 'name')->ignore($w?->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $w = Waiter::create(['name' => trim($data['name']), 'phone' => $data['phone'] ?? null, 'is_active' => $data['is_active'] ?? true]);
        ActivityLogger::log($request->user(), 'create', 'waiters', "Added waiter {$w->name}.");

        return response()->json(['data' => $w], 201);
    }

    public function update(Request $request, Waiter $waiter)
    {
        $data = $request->validate($this->rules($waiter));
        $waiter->update(['name' => trim($data['name']), 'phone' => $data['phone'] ?? null, 'is_active' => $data['is_active'] ?? $waiter->is_active]);

        return response()->json(['data' => $waiter]);
    }

    /** Waiters with orders are switched off instead, so old bills keep the name. */
    public function destroy(Request $request, Waiter $waiter)
    {
        if ($waiter->sales()->exists()) {
            $waiter->update(['is_active' => false]);

            return response()->json(['ok' => true, 'deactivated' => true]);
        }
        $name = $waiter->name;
        $waiter->delete();
        ActivityLogger::log($request->user(), 'delete', 'waiters', "Removed waiter {$name}.");

        return response()->json(['ok' => true]);
    }
}
