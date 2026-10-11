<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Reservation;
use App\Models\Setting;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Table reservations: book a table for a time, then seat the guests (or mark
 * them no-show / cancelled). One table can't be booked twice for overlapping
 * times. Booked tables show as "Reserved" on the Sell screen shortly before.
 */
class ReservationController extends Controller
{
    private static function row(Reservation $r): array
    {
        return [
            'id' => $r->id,
            'name' => $r->name,
            'phone' => $r->phone,
            'guests' => $r->guests,
            'reserved_for' => $r->reserved_for->format('Y-m-d\TH:i:s'),
            'ends_at' => $r->reserved_for->copy()->addMinutes($r->duration_minutes)->format('Y-m-d\TH:i:s'),
            'duration_minutes' => $r->duration_minutes,
            'table_no' => $r->table_no,
            'status' => $r->status,
            'notes' => $r->notes,
            'seated_at' => $r->seated_at?->format('Y-m-d\TH:i:s'),
        ];
    }

    private static function settings(): array
    {
        $s = Setting::group('restaurant');

        return [
            'duration' => max(15, (int) ($s['restaurant.reservation_minutes'] ?? 90) ?: 90),
            'hold' => max(0, (int) ($s['restaurant.reservation_hold'] ?? 60)),
        ];
    }

    /** One day's bookings, its numbers, and how many bookings each of the next 7 days has. */
    public function index(Request $request)
    {
        $day = $request->date('date') ?? now();
        $list = Reservation::whereBetween('reserved_for', [$day->copy()->startOfDay(), $day->copy()->endOfDay()])
            ->orderBy('reserved_for')->orderBy('id')->get();
        $live = $list->whereNotIn('status', ['cancelled', 'no_show']);

        $weekStart = $day->copy()->startOfDay();
        $week = Reservation::whereBetween('reserved_for', [$weekStart, $weekStart->copy()->addDays(6)->endOfDay()])
            ->whereIn('status', ['booked', 'seated', 'done'])->get(['reserved_for'])
            ->groupBy(fn ($r) => $r->reserved_for->toDateString())->map->count();

        return response()->json([
            'date' => $day->toDateString(),
            'data' => $list->map(fn ($r) => self::row($r))->values(),
            'stats' => [
                'bookings' => $live->count(),
                'guests' => (int) $live->sum('guests'),
                'waiting' => $list->where('status', 'booked')->count(),
                'seated' => $list->whereIn('status', ['seated', 'done'])->count(),
                'no_show' => $list->where('status', 'no_show')->count(),
                'cancelled' => $list->where('status', 'cancelled')->count(),
            ],
            'week' => collect(range(0, 6))->mapWithKeys(fn ($i) => [$k = $weekStart->copy()->addDays($i)->toDateString() => (int) ($week[$k] ?? 0)]),
            'settings' => self::settings(),
        ]);
    }

    /** Still-to-come bookings for today — the Sell screen marks their tables "Reserved". */
    public function today()
    {
        $list = Reservation::where('status', 'booked')
            ->whereBetween('reserved_for', [now()->subHours(3), now()->endOfDay()])
            ->orderBy('reserved_for')->get();

        return response()->json(['data' => $list->map(fn ($r) => self::row($r))->values(), 'settings' => self::settings(), 'now' => now()->format('Y-m-d\TH:i:s')]);
    }

    private function validated(Request $request, ?Reservation $r = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:30'],
            'guests' => ['required', 'integer', 'min:1', 'max:999'],
            'reserved_for' => ['required', 'date'],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:720'],
            'table_no' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $data['name'] = trim($data['name']);
        $data['phone'] = trim((string) ($data['phone'] ?? '')) ?: null;
        $data['table_no'] = trim((string) ($data['table_no'] ?? '')) ?: null;
        $data['duration_minutes'] = $data['duration_minutes'] ?? self::settings()['duration'];
        $at = Carbon::parse($data['reserved_for'])->seconds(0);
        if (! $r && $at->lt(now()->subDay())) {
            throw ValidationException::withMessages(['reserved_for' => 'This date has already passed.']);
        }
        $data['reserved_for'] = $at;
        if ($data['table_no']) {
            $this->assertFree($data['table_no'], $at, $data['duration_minutes'], $r?->id);
        }

        return $data;
    }

    /** One table, one booking at a time. */
    private function assertFree(string $table, Carbon $start, int $minutes, ?int $except): void
    {
        $end = $start->copy()->addMinutes($minutes);
        $clash = Reservation::whereIn('status', ['booked', 'seated'])
            ->whereRaw('lower(table_no) = ?', [mb_strtolower($table)])
            ->whereBetween('reserved_for', [$start->copy()->subHours(13), $end])
            ->when($except, fn ($q) => $q->where('id', '!=', $except))
            ->get()
            ->first(fn ($o) => $o->reserved_for->lt($end) && $o->reserved_for->copy()->addMinutes($o->duration_minutes)->gt($start));
        if ($clash) {
            $from = $clash->reserved_for->format('g:i A');
            $to = $clash->reserved_for->copy()->addMinutes($clash->duration_minutes)->format('g:i A');
            throw ValidationException::withMessages(['table_no' => "Table {$table} is already booked {$from} – {$to} for {$clash->name}. Pick another table or time."]);
        }
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $r = Reservation::create([...$data, 'status' => 'booked', 'created_by' => $request->user()->id]);
        ActivityLogger::log($request->user(), 'create', 'reservations', "Booked {$r->name} ({$r->guests}) for ".$r->reserved_for->format('d M g:i A').($r->table_no ? " at table {$r->table_no}" : '').'.');

        return response()->json(['data' => self::row($r)], 201);
    }

    public function update(Request $request, Reservation $reservation)
    {
        $data = $this->validated($request, $reservation);
        $reservation->update($data);

        return response()->json(['data' => self::row($reservation->fresh())]);
    }

    /** Seat the guests, finish, cancel, mark no-show — or put a booking back. */
    public function status(Request $request, Reservation $reservation)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Reservation::STATUSES)],
            'table_no' => ['nullable', 'string', 'max:20'],
        ]);
        $patch = ['status' => $data['status']];
        if (! empty($data['table_no'])) {
            $patch['table_no'] = trim($data['table_no']);
        }
        if ($data['status'] === 'seated') {
            $patch['seated_at'] = now();
        }
        if (in_array($data['status'], ['booked', 'seated'], true) && ($patch['table_no'] ?? $reservation->table_no)) {
            $this->assertFree($patch['table_no'] ?? $reservation->table_no, $reservation->reserved_for, $reservation->duration_minutes, $reservation->id);
        }
        $reservation->update($patch);
        ActivityLogger::log($request->user(), 'update', 'reservations', "Reservation of {$reservation->name}: {$data['status']}.");

        return response()->json(['data' => self::row($reservation->fresh())]);
    }

    public function destroy(Request $request, Reservation $reservation)
    {
        $reservation->delete();
        ActivityLogger::log($request->user(), 'delete', 'reservations', "Deleted the reservation of {$reservation->name}.");

        return response()->json(['ok' => true]);
    }
}
