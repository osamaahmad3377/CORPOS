<?php

namespace App\Services;

use App\Models\CashSession;
use App\Models\SaleReturn;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Builds the live summary / Z-report of one cash drawer session: everything
 * the session's cashier did between opened_at and closed_at (or now).
 *
 * Money "taken at the counter" for a bill is min(payment_received,
 * grand_total) — unlike sales.paid_amount it does not move when udhaar is
 * paid later or when items are returned, so the report stays stable.
 */
class CashSummaryService
{
    public static function build(CashSession $session, ?Carbon $until = null): array
    {
        $from = $session->opened_at;
        $to = $until ?? $session->closed_at ?? now();
        $userId = $session->user_id;
        $window = [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')];

        $paidExpr = 'CASE WHEN payment_received < grand_total THEN payment_received ELSE grand_total END';

        // ------------------------------------------------------------ sales
        $byMethod = DB::table('sales')
            ->where('cashier_id', $userId)
            ->whereIn('status', ['completed', 'returned'])
            ->whereNull('deleted_at')
            ->whereBetween('created_at', $window)
            ->groupBy('payment_method')
            ->selectRaw("payment_method, COUNT(*) AS bills, SUM(grand_total) AS total, SUM({$paidExpr}) AS paid, SUM(discount_amount) AS discount")
            ->get();

        $bills = 0;
        $salesTotal = 0.0;
        $paidTotal = 0.0;
        $discounts = 0.0;
        $cashSales = 0.0;
        $payments = [];
        foreach ($byMethod as $row) {
            $bills += (int) $row->bills;
            $salesTotal += (float) $row->total;
            $paidTotal += (float) $row->paid;
            $discounts += (float) $row->discount;
            if ($row->payment_method === 'cash') {
                $cashSales += (float) $row->paid;
            }
            $payments[] = [
                'method' => $row->payment_method,
                'bills' => (int) $row->bills,
                'amount' => self::m($row->paid),
            ];
        }
        usort($payments, fn ($a, $b) => ($b['method'] === 'cash') <=> ($a['method'] === 'cash') ?: $b['amount'] <=> $a['amount']);

        // ---------------------------------------------------------- returns
        // A return first clears whatever is still owed on the bill (see
        // SaleReturnController); only the rest is handed back. For cash bills
        // that handed-back part comes out of the drawer.
        $returns = SaleReturn::with('sale:id,payment_method,grand_total,payment_received')
            ->where('processed_by', $userId)
            ->whereBetween('created_at', $window)
            ->orderBy('id')
            ->get(['id', 'sale_id', 'total_refund']);

        $refundTotal = 0.0;
        $cashRefunds = 0.0;
        foreach ($returns as $ret) {
            $refund = (float) $ret->total_refund;
            $refundTotal += $refund;
            $sale = $ret->sale;
            if (! $sale || $sale->payment_method !== 'cash') {
                continue;
            }
            $grand = (float) $sale->grand_total;
            $paidAtSale = min((float) $sale->payment_received, $grand);
            $earlier = (float) SaleReturn::where('sale_id', $sale->id)->where('id', '<', $ret->id)->sum('total_refund');
            $dueBefore = max(0, $grand - min($grand, $paidAtSale + $earlier));
            $cashRefunds += max(0, $refund - $dueBefore);
        }

        // ------------------------------------------------- pay in / pay out
        $moves = DB::table('cash_movements')
            ->where('cash_session_id', $session->id)
            ->groupBy('type')
            ->selectRaw('type, COUNT(*) AS n, SUM(amount) AS total')
            ->get()
            ->keyBy('type');
        $payIn = (float) ($moves['in']->total ?? 0);
        $payOut = (float) ($moves['out']->total ?? 0);

        // --------------------------------------------------------- expenses
        $expensesAvailable = Schema::hasTable('expenses')
            && Schema::hasColumns('expenses', ['amount', 'payment_method', 'user_id', 'created_at']);
        $expenseCount = 0;
        $cashExpenses = 0.0;
        if ($expensesAvailable) {
            $q = DB::table('expenses')
                ->where('payment_method', 'cash')
                ->where('user_id', $userId)
                ->whereBetween('created_at', $window);
            if (Schema::hasColumn('expenses', 'deleted_at')) {
                $q->whereNull('deleted_at');
            }
            $agg = $q->selectRaw('COUNT(*) AS n, SUM(amount) AS total')->first();
            $expenseCount = (int) ($agg->n ?? 0);
            $cashExpenses = (float) ($agg->total ?? 0);
        }

        // ------------------------------------------- udhaar collected later
        $udhaar = ['count' => 0, 'total' => 0.0, 'cash' => 0.0];
        if (Schema::hasTable('sale_payments')) {
            $rows = DB::table('sale_payments')->where('user_id', $userId)->whereBetween('created_at', $window)
                ->selectRaw("COUNT(*) AS n, SUM(amount) AS total, SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) AS cash")->first();
            $udhaar = ['count' => (int) ($rows->n ?? 0), 'total' => (float) ($rows->total ?? 0), 'cash' => (float) ($rows->cash ?? 0)];
        }

        $opening = (float) $session->opening_cash;
        $expected = $opening + $cashSales + $udhaar['cash'] + $payIn - $payOut - $cashRefunds - $cashExpenses;

        return [
            'from' => $from->toIso8601String(),
            'to' => $to->toIso8601String(),
            'bills' => $bills,
            'sales_total' => self::m($salesTotal),
            'discounts' => self::m($discounts),
            'paid_total' => self::m($paidTotal),
            'udhaar_given' => self::m($salesTotal - $paidTotal),
            'net_sales' => self::m($salesTotal - $refundTotal),
            'payments' => $payments,
            'cash_sales' => self::m($cashSales),
            'refunds' => [
                'count' => $returns->count(),
                'total' => self::m($refundTotal),
                'cash' => self::m($cashRefunds),
            ],
            'udhaar_received' => [
                'count' => $udhaar['count'],
                'total' => self::m($udhaar['total']),
                'cash' => self::m($udhaar['cash']),
            ],
            'pay_in' => self::m($payIn),
            'pay_in_count' => (int) ($moves['in']->n ?? 0),
            'pay_out' => self::m($payOut),
            'pay_out_count' => (int) ($moves['out']->n ?? 0),
            'expenses' => [
                'available' => $expensesAvailable,
                'count' => $expenseCount,
                'cash' => self::m($cashExpenses),
            ],
            'opening_cash' => self::m($opening),
            'expected_cash' => self::m($expected),
            'held_bills' => DB::table('sales')->where('cashier_id', $userId)->where('status', 'held')->whereNull('deleted_at')->count(),
        ];
    }

    private static function m($v): float
    {
        return round((float) $v, 2);
    }
}
