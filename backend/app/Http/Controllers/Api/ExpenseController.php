<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Services\ActivityLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    /**
     * GET /expenses?start=&end=&category=&payment_method=&q=&per_page=
     * Paginated list plus totals for the whole filter (not just this page).
     */
    public function index(Request $request)
    {
        $request->validate([
            'start' => ['nullable', 'date_format:Y-m-d'],
            'end' => ['nullable', 'date_format:Y-m-d'],
            'category' => ['nullable', 'string', 'max:60'],
            'payment_method' => ['nullable', 'string', 'max:30'],
            'q' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $filtered = fn () => $this->filtered($request);

        $page = $filtered()->with('user')
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        $byCategory = $filtered()
            ->selectRaw('category, COUNT(*) as count, SUM(amount) as total')
            ->groupBy('category')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['category' => $r->category, 'count' => (int) $r->count, 'total' => round((float) $r->total, 2)]);

        $byMethod = $filtered()
            ->selectRaw('payment_method, COUNT(*) as count, SUM(amount) as total')
            ->groupBy('payment_method')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['payment_method' => $r->payment_method, 'count' => (int) $r->count, 'total' => round((float) $r->total, 2)]);

        return ExpenseResource::collection($page)->additional([
            'totals' => [
                'count' => $byCategory->sum('count'),
                'amount' => round($byCategory->sum('total'), 2),
                'by_category' => $byCategory->values(),
                'by_payment_method' => $byMethod->values(),
            ],
        ]);
    }

    /** GET /expenses/categories — defaults first, then any others the shop has typed. */
    public function categories()
    {
        $used = Expense::query()
            ->selectRaw('category, COUNT(*) as uses')
            ->groupBy('category')
            ->orderByDesc('uses')
            ->pluck('category');

        $defaults = collect(Expense::DEFAULT_CATEGORIES);
        $lower = $defaults->map(fn ($c) => mb_strtolower($c));
        $extra = $used->reject(fn ($c) => $lower->contains(mb_strtolower($c)))->values();

        return response()->json([
            'data' => $defaults->concat($extra)->values(),
            'defaults' => $defaults->values(),
            'used' => $used->values(),
        ]);
    }

    public function store(StoreExpenseRequest $request)
    {
        $expense = Expense::create($request->validated() + ['user_id' => $request->user()->id]);

        ActivityLogger::log($request->user(), 'create', 'expenses',
            "Added expense {$expense->category}: Rs {$expense->amount} ({$expense->expense_date->format('Y-m-d')}).");

        return (new ExpenseResource($expense->load('user')))->response()->setStatusCode(201);
    }

    public function show(Expense $expense)
    {
        return new ExpenseResource($expense->load('user'));
    }

    public function update(StoreExpenseRequest $request, Expense $expense)
    {
        $before = "{$expense->category} Rs {$expense->amount}";
        $expense->update($request->validated());

        ActivityLogger::log($request->user(), 'update', 'expenses',
            "Changed expense #{$expense->id} ({$before} → {$expense->category} Rs {$expense->amount}).");

        return new ExpenseResource($expense->load('user'));
    }

    public function destroy(Request $request, Expense $expense)
    {
        $desc = "Deleted expense #{$expense->id} {$expense->category}: Rs {$expense->amount} ({$expense->expense_date->format('Y-m-d')}).";
        $expense->delete();

        ActivityLogger::log($request->user(), 'delete', 'expenses', $desc);

        return response()->json(['message' => 'Expense deleted.']);
    }

    private function filtered(Request $request): Builder
    {
        $query = Expense::query();

        if ($request->filled('start')) {
            $query->whereDate('expense_date', '>=', $request->input('start'));
        }
        if ($request->filled('end')) {
            $query->whereDate('expense_date', '<=', $request->input('end'));
        }
        if ($request->filled('category')) {
            $query->where('category', $request->input('category'));
        }
        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->input('payment_method'));
        }
        if ($request->filled('q')) {
            $term = '%'.$request->input('q').'%';
            $query->where(fn ($w) => $w->where('note', 'like', $term)->orWhere('category', 'like', $term));
        }

        return $query;
    }
}
