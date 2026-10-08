<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductVariantResource;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $user = $request->user();
        $isFullAccess = $user->hasPermission('dashboard.view_all');

        $salesQuery = Sale::where('status', 'completed');
        if (! $isFullAccess) {
            $salesQuery->where('cashier_id', $user->id);
        }

        $todaySales = (clone $salesQuery)->whereDate('sale_date', now()->toDateString());

        $stats = [
            'today_sales_count' => $todaySales->count(),
            // Net of returns — a fully/partially returned sale shouldn't
            // inflate "today's revenue".
            'today_revenue' => (clone $todaySales)->sum(DB::raw('grand_total - refunded_amount')),
        ];

        if ($isFullAccess) {
            $stats['month_revenue'] = (clone $salesQuery)->whereMonth('sale_date', now()->month)
                ->whereYear('sale_date', now()->year)
                ->sum(DB::raw('grand_total - refunded_amount'));
            $stats['total_products'] = Product::count();
            $stats['total_customers'] = Customer::count();
            $stats['low_stock_count'] = ProductVariant::whereColumn('stock_qty', '<=', 'low_stock_threshold')->count();
            $stats['payment_split'] = Sale::where('status', 'completed')
                ->whereMonth('sale_date', now()->month)
                ->whereYear('sale_date', now()->year)
                ->selectRaw('payment_method, COUNT(*) as count')
                ->groupBy('payment_method')
                ->pluck('count', 'payment_method');
        }

        return response()->json($stats);
    }

    public function salesChart(Request $request)
    {
        $user = $request->user();
        $isFullAccess = $user->hasPermission('dashboard.view_all');

        $query = Sale::where('status', 'completed')
            ->where('sale_date', '>=', now()->subDays(30)->startOfDay());

        if (! $isFullAccess) {
            $query->where('cashier_id', $user->id);
        }

        $data = $query->selectRaw('DATE(sale_date) as date, SUM(grand_total - refunded_amount) as total')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json($data);
    }

    public function topProducts(Request $request)
    {
        $limit = $request->integer('limit', 10);

        // Net out returned quantity/value per line so a returned item
        // doesn't keep counting toward "best sellers".
        $returnsAgg = DB::raw('(
            SELECT sale_item_id, SUM(quantity_returned) as qty_returned, SUM(refund_amount) as amount_returned
            FROM sale_return_items GROUP BY sale_item_id
        ) as returns_agg');

        $data = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('product_variants', 'product_variants.id', '=', 'sale_items.variant_id')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin($returnsAgg, 'returns_agg.sale_item_id', '=', 'sale_items.id')
            ->where('sales.status', 'completed')
            ->groupBy('products.id', 'products.name')
            ->selectRaw('products.id, products.name,
                SUM(sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) as quantity_sold,
                SUM(sale_items.total_price - COALESCE(returns_agg.amount_returned, 0)) as revenue')
            ->orderByDesc('quantity_sold')
            ->limit($limit)
            ->get();

        return response()->json($data);
    }

    public function lowStock()
    {
        $variants = ProductVariant::with('product')
            ->whereColumn('stock_qty', '<=', 'low_stock_threshold')
            ->orderBy('stock_qty')
            ->get();

        return ProductVariantResource::collection($variants);
    }

    public function recentSales(Request $request)
    {
        $user = $request->user();
        $isFullAccess = $user->hasPermission('dashboard.view_all');

        $query = Sale::with(['customer', 'cashier']);

        if (! $isFullAccess) {
            $query->where('cashier_id', $user->id);
        }

        $sales = $query->orderByDesc('id')->limit($request->integer('limit', 10))->get();

        return SaleResource::collection($sales);
    }

    /**
     * Everything the Home charts need in one call, for the last 7 or 30 days:
     * daily trend (with the previous period for comparison), payment split by
     * amount, sales by category, busy hours and best sellers. Staff without
     * dashboard.view_all only see their own bills (and no profit).
     */
    public function insights(Request $request)
    {
        $days = in_array($request->integer('days', 7), [7, 30], true) ? $request->integer('days', 7) : 7;
        $user = $request->user();
        $full = $user->hasPermission('dashboard.view_all');
        $from = now()->subDays($days - 1)->startOfDay();
        $prevFrom = (clone $from)->subDays($days);

        $sales = fn () => DB::table('sales')->where('status', 'completed')->whereNull('deleted_at')
            ->when(! $full, fn ($q) => $q->where('cashier_id', $user->id));
        $net = 'grand_total - COALESCE(refunded_amount, 0)';

        // ---------------------------------------------------- daily trend
        $rows = $sales()->where('sale_date', '>=', $from)
            ->selectRaw("DATE(sale_date) as d, SUM({$net}) as total, COUNT(*) as bills")
            ->groupBy('d')->get()->keyBy('d');
        $trend = [];
        for ($i = 0; $i < $days; $i++) {
            $d = (clone $from)->addDays($i)->toDateString();
            $trend[] = ['date' => $d, 'total' => round((float) ($rows[$d]->total ?? 0), 2), 'bills' => (int) ($rows[$d]->bills ?? 0)];
        }
        $total = array_sum(array_column($trend, 'total'));
        $bills = array_sum(array_column($trend, 'bills'));
        $prevTotal = (float) $sales()->whereBetween('sale_date', [$prevFrom, (clone $from)->subSecond()])->sum(DB::raw($net));

        // ------------------------------------------- payment split (amount)
        $payments = $sales()->where('sale_date', '>=', $from)
            ->selectRaw("payment_method as method, SUM({$net}) as amount, COUNT(*) as bills")
            ->groupBy('payment_method')->orderByDesc('amount')->get()
            ->map(fn ($r) => ['method' => $r->method, 'label' => config("pos.payment_methods.{$r->method}", ucfirst((string) $r->method)), 'amount' => round((float) $r->amount, 2), 'bills' => (int) $r->bills])
            ->filter(fn ($r) => $r['amount'] > 0)->values();

        // ------------------------------------------- items (net of returns)
        $returns = DB::raw('(SELECT sale_item_id, SUM(quantity_returned) AS qty_r, SUM(refund_amount) AS amt_r FROM sale_return_items GROUP BY sale_item_id) AS r');
        $items = fn () => DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->leftJoin($returns, 'r.sale_item_id', '=', 'sale_items.id')
            ->where('sales.status', 'completed')->whereNull('sales.deleted_at')
            ->where('sales.sale_date', '>=', $from)
            ->when(! $full, fn ($q) => $q->where('sales.cashier_id', $user->id));
        $lineNet = 'sale_items.total_price - COALESCE(r.amt_r, 0)';

        $categories = $items()
            ->join('product_variants', 'product_variants.id', '=', 'sale_items.variant_id')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->join('categories as c', 'c.id', '=', 'products.category_id')
            ->leftJoin('categories as pc', 'pc.id', '=', 'c.parent_id')
            ->selectRaw("COALESCE(pc.name, c.name) as name, SUM({$lineNet}) as amount")
            ->groupBy(DB::raw('COALESCE(pc.name, c.name)'))->orderByDesc('amount')->get()
            ->map(fn ($r) => ['name' => $r->name, 'amount' => round((float) $r->amount, 2)])
            ->filter(fn ($r) => $r['amount'] > 0)->values();

        $top = $items()
            ->join('product_variants', 'product_variants.id', '=', 'sale_items.variant_id')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->selectRaw("products.name as name, SUM(sale_items.quantity - COALESCE(r.qty_r, 0)) as qty, SUM({$lineNet}) as amount")
            ->groupBy('products.id', 'products.name')->orderByDesc('amount')->limit(5)->get()
            ->map(fn ($r) => ['name' => $r->name, 'qty' => round((float) $r->qty, 3), 'amount' => round((float) $r->amount, 2)])
            ->filter(fn ($r) => $r['amount'] > 0)->values();

        // ---------------------------------------------------- busy hours
        $hourRows = $sales()->where('sale_date', '>=', $from)
            ->selectRaw("CAST(strftime('%H', sale_date) AS INTEGER) as h, COUNT(*) as bills, SUM({$net}) as total")
            ->groupBy('h')->get()->keyBy('h');
        $hours = [];
        for ($h = 0; $h < 24; $h++) {
            $hours[] = ['hour' => $h, 'bills' => (int) ($hourRows[$h]->bills ?? 0), 'total' => round((float) ($hourRows[$h]->total ?? 0), 2)];
        }

        $out = [
            'days' => $days,
            'total' => round($total, 2),
            'bills' => $bills,
            'average_bill' => $bills ? round($total / $bills, 2) : 0,
            'previous_total' => round($prevTotal, 2),
            'change_percent' => $prevTotal > 0 ? round(($total - $prevTotal) / $prevTotal * 100, 1) : null,
            'trend' => $trend,
            'payments' => $payments,
            'categories' => $categories,
            'top_products' => $top,
            'hours' => $hours,
        ];
        if ($full) {
            $cost = (float) $items()->sum(DB::raw('COALESCE(sale_items.cost_price, 0) * (sale_items.quantity - COALESCE(r.qty_r, 0))'));
            $out['profit'] = round($total - $cost, 2);
        }

        return response()->json($out);
    }
}
