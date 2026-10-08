<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\CashSummaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cash drawer & day closing (Z-report). Each cashier opens their own drawer
 * with the cash already in it, records cash put in / taken out, and closes
 * the day by counting the cash. Expected cash comes from CashSummaryService.
 */
class CashController extends Controller
{
    /**
     * The signed-in user's open drawer (with live summary), or data=null.
     * Open to every signed-in user so the POS can warn "Drawer not opened".
     */
    public function current(Request $request)
    {
        $user = $request->user();
        $session = $this->openSessionOf($user->id);

        return response()->json([
            'data' => $session ? $this->present($session, true) : null,
            'can_manage' => $user->hasPermission('cash.manage'),
        ]);
    }

    public function open(Request $request)
    {
        $validated = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $user = $request->user();

        $session = DB::transaction(function () use ($validated, $user) {
            if ($this->openSessionOf($user->id)) {
                throw ValidationException::withMessages([
                    'opening_cash' => ['Your drawer is already open. Close the day first.'],
                ]);
            }

            return CashSession::create([
                'user_id' => $user->id,
                'opened_at' => now(),
                'opening_cash' => round((float) $validated['opening_cash'], 2),
                'opening_note' => $validated['note'] ?? null,
            ]);
        });

        ActivityLogger::log($user, 'open', 'cash', "Opened cash drawer #{$session->id} with Rs {$session->opening_cash}.");

        return response()->json(['data' => $this->present($session->fresh(), true)], 201);
    }

    public function movement(Request $request)
    {
        $validated = $request->validate([
            'type' => ['required', 'in:in,out'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999'],
            'reason' => ['required', 'string', 'max:255'],
        ]);
        $user = $request->user();

        $session = $this->openSessionOf($user->id);
        if (! $session) {
            throw ValidationException::withMessages(['amount' => ['Open the day first.']]);
        }

        $move = CashMovement::create([
            'cash_session_id' => $session->id,
            'type' => $validated['type'],
            'amount' => round((float) $validated['amount'], 2),
            'reason' => trim($validated['reason']),
            'user_id' => $user->id,
        ]);

        $word = $move->type === 'in' ? 'Cash in' : 'Cash out';
        ActivityLogger::log($user, $move->type === 'in' ? 'cash_in' : 'cash_out', 'cash', "{$word} Rs {$move->amount} (drawer #{$session->id}): {$move->reason}");

        return response()->json(['data' => $this->present($session->fresh(), true)], 201);
    }

    /** Close the signed-in user's own drawer. */
    public function close(Request $request)
    {
        $session = $this->openSessionOf($request->user()->id);
        if (! $session) {
            throw ValidationException::withMessages(['counted_cash' => ['Your drawer is not open.']]);
        }

        return $this->doClose($request, $session);
    }

    /** A manager (cash.view_all) closes a drawer someone left open. */
    public function closeOther(Request $request, CashSession $cashSession)
    {
        if (! $cashSession->isOpen()) {
            throw ValidationException::withMessages(['counted_cash' => ['This day is already closed.']]);
        }

        return $this->doClose($request, $cashSession);
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $viewAll = $user->hasPermission('cash.view_all');
        abort_unless($viewAll || $user->hasPermission('cash.manage'), 403, 'You do not have permission to perform this action.');

        $query = CashSession::with(['user:id,name', 'closer:id,name'])->orderByDesc('opened_at')->orderByDesc('id');

        if (! $viewAll) {
            $query->where('user_id', $user->id);
        } elseif ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }
        if ($request->filled('start_date')) {
            $query->whereDate('opened_at', '>=', $request->date('start_date'));
        }
        if ($request->filled('end_date')) {
            $query->whereDate('opened_at', '<=', $request->date('end_date'));
        }
        if ($request->input('status') === 'open') {
            $query->whereNull('closed_at');
        } elseif ($request->input('status') === 'closed') {
            $query->whereNotNull('closed_at');
        }

        $page = $query->paginate(min(100, max(1, $request->integer('per_page', 20))));
        $page->getCollection()->transform(fn (CashSession $s) => $this->present($s, false));

        $extra = [];
        if ($viewAll) {
            $extra['cashiers'] = User::whereIn('id', CashSession::select('user_id')->distinct())
                ->orderBy('name')->get(['id', 'name']);
        }

        return response()->json(array_merge($page->toArray(), [
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ], $extra));
    }

    public function show(Request $request, CashSession $cashSession)
    {
        $this->authorizeView($request->user(), $cashSession);

        return response()->json(['data' => $this->present($cashSession, true)]);
    }

    // ------------------------------------------------------------ helpers

    private function doClose(Request $request, CashSession $session)
    {
        $validated = $request->validate([
            'counted_cash' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $user = $request->user();

        $session = DB::transaction(function () use ($session, $validated, $user) {
            $locked = CashSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if (! $locked->isOpen()) {
                throw ValidationException::withMessages(['counted_cash' => ['This day is already closed.']]);
            }

            $closedAt = now();
            $summary = CashSummaryService::build($locked, $closedAt);
            $counted = round((float) $validated['counted_cash'], 2);
            $expected = $summary['expected_cash'];

            $locked->update([
                'closed_at' => $closedAt,
                'counted_cash' => $counted,
                'expected_cash' => $expected,
                'difference' => round($counted - $expected, 2),
                'closing_note' => $validated['note'] ?? null,
                'closed_by' => $user->id,
                'summary' => $summary,
            ]);

            return $locked;
        });

        $diff = (float) $session->difference;
        $state = abs($diff) < 1 ? 'correct' : ($diff < 0 ? 'short by Rs '.abs($diff) : 'extra Rs '.$diff);
        $whose = $session->user_id === $user->id ? '' : " for {$session->user?->name}";
        ActivityLogger::log($user, 'close', 'cash', "Closed cash drawer #{$session->id}{$whose}: counted Rs {$session->counted_cash}, expected Rs {$session->expected_cash} ({$state}).");

        return response()->json(['data' => $this->present($session->fresh(), true)]);
    }

    private function openSessionOf(int $userId): ?CashSession
    {
        return CashSession::where('user_id', $userId)->whereNull('closed_at')->latest('opened_at')->first();
    }

    private function authorizeView(User $user, CashSession $session): void
    {
        if ($user->hasPermission('cash.view_all')) {
            return;
        }
        abort_unless($user->hasPermission('cash.manage') && $session->user_id === $user->id, 403, 'You do not have permission to perform this action.');
    }

    private function present(CashSession $s, bool $full): array
    {
        $s->loadMissing(['user:id,name', 'closer:id,name']);
        $open = $s->isOpen();
        // Closed days use the summary frozen at closing time.
        $summary = $open || ! $s->summary ? CashSummaryService::build($s) : $s->summary;

        $out = [
            'id' => $s->id,
            'status' => $open ? 'open' : 'closed',
            'user' => $s->user ? ['id' => $s->user->id, 'name' => $s->user->name] : null,
            'opened_at' => $s->opened_at?->toIso8601String(),
            'opening_cash' => (float) $s->opening_cash,
            'opening_note' => $s->opening_note,
            'closed_at' => $s->closed_at?->toIso8601String(),
            'closed_by' => $s->closer ? ['id' => $s->closer->id, 'name' => $s->closer->name] : null,
            'counted_cash' => $s->counted_cash === null ? null : (float) $s->counted_cash,
            'expected_cash' => $open ? $summary['expected_cash'] : (float) $s->expected_cash,
            'difference' => $s->difference === null ? null : (float) $s->difference,
            'closing_note' => $s->closing_note,
            'bills' => $summary['bills'] ?? 0,
            'sales_total' => $summary['sales_total'] ?? 0,
        ];

        if ($full) {
            $out['summary'] = $summary;
            $out['movements'] = $s->movements()->with('user:id,name')->orderBy('id')->get()
                ->map(fn (CashMovement $m) => [
                    'id' => $m->id,
                    'type' => $m->type,
                    'amount' => (float) $m->amount,
                    'reason' => $m->reason,
                    'user' => $m->user?->name,
                    'created_at' => $m->created_at?->toIso8601String(),
                ])->values();
        }

        return $out;
    }
}
