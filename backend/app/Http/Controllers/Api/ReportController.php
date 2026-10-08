<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductVariantResource;
use App\Http\Resources\PurchaseResource;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function dailySales(Request $request)
    {
        $date = $request->date('date', now()->toDateString()) ?? now()->toDateString();

        $sales = Sale::with(['customer', 'cashier'])
            ->where('status', 'completed')
            ->whereDate('sale_date', $date)
            ->orderBy('sale_date')
            ->get();

        return response()->json([
            'date' => $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : $date,
            'total_sales' => $sales->count(),
            'total_revenue' => $sales->sum(fn (Sale $sale) => $sale->grand_total - $sale->refunded_amount),
            'sales' => SaleResource::collection($sales),
        ]);
    }

    public function monthlySales(Request $request)
    {
        $month = $request->string('month', now()->format('Y-m'));
        [$year, $monthNumber] = explode('-', $month);

        $data = Sale::where('status', 'completed')
            ->whereYear('sale_date', $year)
            ->whereMonth('sale_date', $monthNumber)
            ->selectRaw('DATE(sale_date) as date, COUNT(*) as total_sales, SUM(grand_total - refunded_amount) as total_revenue')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json([
            'month' => (string) $month,
            'daily_breakdown' => $data,
            'total_revenue' => $data->sum('total_revenue'),
        ]);
    }

    public function productSales(Request $request)
    {
        $returnsAgg = DB::raw('(
            SELECT sale_item_id, SUM(quantity_returned) as qty_returned, SUM(refund_amount) as amount_returned
            FROM sale_return_items GROUP BY sale_item_id
        ) as returns_agg');

        $query = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('product_variants', 'product_variants.id', '=', 'sale_items.variant_id')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin($returnsAgg, 'returns_agg.sale_item_id', '=', 'sale_items.id')
            ->where('sales.status', 'completed');

        if ($request->filled('start')) {
            $query->whereDate('sales.sale_date', '>=', $request->date('start'));
        }

        if ($request->filled('end')) {
            $query->whereDate('sales.sale_date', '<=', $request->date('end'));
        }

        if ($request->filled('category_id')) {
            $query->where('products.category_id', $request->integer('category_id'));
        }

        $data = $query->groupBy('products.id', 'products.name', 'products.unit')
            ->selectRaw('products.id, products.name, products.unit,
                SUM(sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) as quantity_sold,
                SUM(sale_items.total_price - COALESCE(returns_agg.amount_returned, 0)) as revenue,
                SUM((sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) * COALESCE(sale_items.cost_price, 0)) as cost')
            ->orderByDesc('revenue')
            ->get();

        // Cost and profit are margin data — only for staff who may see cost prices.
        $canSeeCost = $request->user()->hasPermission('purchases.view');
        $data->transform(function ($row) use ($canSeeCost) {
            $row->quantity_sold = round((float) $row->quantity_sold, 3);
            $row->revenue = round((float) $row->revenue, 2);
            if ($canSeeCost) {
                $row->cost = round((float) $row->cost, 2);
                $row->profit = round($row->revenue - $row->cost, 2);
            } else {
                unset($row->cost);
            }

            return $row;
        });

        return response()->json($data);
    }

    /**
     * GET /reports/profit?start=&end= — Sales → cost of goods → gross profit
     * → expenses → net profit for a date range. Returns are taken off the
     * sale they belong to (same as product-sales); tax collected is shown
     * separately because it is the government's money, not the shop's.
     * Cost and profit figures are only sent to users with purchases.view.
     */
    public function profit(Request $request)
    {
        $request->validate([
            'start' => ['nullable', 'date_format:Y-m-d'],
            'end' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $start = $request->input('start') ?: now()->startOfMonth()->toDateString();
        $end = $request->input('end') ?: now()->toDateString();
        if ($end < $start) {
            [$start, $end] = [$end, $start];
        }

        $sales = fn () => DB::table('sales')
            ->whereNull('sales.deleted_at')
            ->whereIn('sales.status', ['completed', 'returned'])
            ->whereDate('sales.sale_date', '>=', $start)
            ->whereDate('sales.sale_date', '<=', $end);

        $s = $sales()->selectRaw('COUNT(*) as bills,
            COALESCE(SUM(grand_total), 0) as gross_sales,
            COALESCE(SUM(refunded_amount), 0) as returns,
            COALESCE(SUM(discount_amount), 0) as discounts,
            COALESCE(SUM(CASE WHEN grand_total > 0 THEN tax_amount * (grand_total - refunded_amount) / grand_total ELSE 0 END), 0) as tax')
            ->first();

        $grossSales = round((float) $s->gross_sales, 2);
        $returns = round((float) $s->returns, 2);
        $tax = round((float) $s->tax, 2);
        $revenue = round($grossSales - $returns - $tax, 2);

        $returnsAgg = DB::raw('(SELECT sale_item_id, SUM(quantity_returned) as qty_returned
            FROM sale_return_items GROUP BY sale_item_id) as returns_agg');

        $c = $sales()
            ->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')
            ->leftJoin($returnsAgg, 'returns_agg.sale_item_id', '=', 'sale_items.id')
            ->selectRaw('COALESCE(SUM((sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) * COALESCE(sale_items.cost_price, 0)), 0) as cogs,
                COALESCE(SUM(CASE WHEN (sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) > 0
                    AND COALESCE(sale_items.cost_price, 0) <= 0 THEN 1 ELSE 0 END), 0) as lines_without_cost')
            ->first();

        $byCategory = DB::table('expenses')
            ->whereDate('expense_date', '>=', $start)
            ->whereDate('expense_date', '<=', $end)
            ->selectRaw('category, COUNT(*) as count, SUM(amount) as total')
            ->groupBy('category')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['category' => $r->category, 'count' => (int) $r->count, 'total' => round((float) $r->total, 2)])
            ->values();
        $expenses = round($byCategory->sum('total'), 2);

        $canSeeCost = $request->user()->hasPermission('purchases.view');
        $cogs = round((float) $c->cogs, 2);
        $grossProfit = round($revenue - $cogs, 2);
        $netProfit = round($grossProfit - $expenses, 2);
        $pct = fn (float $part) => $revenue > 0 ? round($part / $revenue * 100, 1) : null;

        return response()->json([
            'start' => $start,
            'end' => $end,
            'can_see_cost' => $canSeeCost,
            'bills' => (int) $s->bills,
            'gross_sales' => $grossSales,
            'returns' => $returns,
            'discounts' => round((float) $s->discounts, 2),
            'tax' => $tax,
            'revenue' => $revenue,
            'cost_of_goods' => $canSeeCost ? $cogs : null,
            'gross_profit' => $canSeeCost ? $grossProfit : null,
            'gross_margin_percent' => $canSeeCost ? $pct($grossProfit) : null,
            'expenses_total' => $expenses,
            'expenses_by_category' => $byCategory,
            'net_profit' => $canSeeCost ? $netProfit : null,
            'net_margin_percent' => $canSeeCost ? $pct($netProfit) : null,
            'lines_without_cost' => $canSeeCost ? (int) $c->lines_without_cost : null,
        ]);
    }

    public function inventory(Request $request)
    {
        $variants = ProductVariant::with('product')->orderBy('id')->get();

        // Same cost-visibility rule as ProductVariantResource — computing
        // this total from the raw model bypassed that gate, so a cashier
        // couldn't see any single item's cost but could still read the
        // company's total inventory cost value here.
        $canSeeCost = $request->user()?->hasPermission('purchases.view') ?? false;

        return response()->json([
            'total_variants' => $variants->count(),
            'total_stock_value' => $canSeeCost
                ? $variants->sum(fn ($variant) => $variant->stock_qty * $variant->purchase_price)
                : null,
            'variants' => ProductVariantResource::collection($variants),
        ]);
    }

    public function lowStock()
    {
        $variants = ProductVariant::with('product')
            ->whereColumn('stock_qty', '<=', 'low_stock_threshold')
            ->orderBy('stock_qty')
            ->get();

        return ProductVariantResource::collection($variants);
    }

    public function purchases(Request $request)
    {
        $query = Purchase::with(['supplier', 'creator']);

        if ($request->filled('start')) {
            $query->whereDate('purchase_date', '>=', $request->date('start'));
        }

        if ($request->filled('end')) {
            $query->whereDate('purchase_date', '<=', $request->date('end'));
        }

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->integer('supplier_id'));
        }

        $purchases = $query->orderByDesc('purchase_date')->get();

        return response()->json([
            'total_purchases' => $purchases->count(),
            'total_amount' => $purchases->sum('grand_total'),
            'purchases' => PurchaseResource::collection($purchases),
        ]);
    }

    public function customers()
    {
        // Outstanding balance per customer = unpaid part of their completed
        // bills (same rule as Sale::due_amount: grand_total - paid_amount, floored at 0).
        $customers = Customer::withCount('sales')
            ->addSelect(['due_amount' => Sale::query()
                ->selectRaw('COALESCE(SUM(CASE WHEN grand_total > paid_amount THEN grand_total - paid_amount ELSE 0 END), 0)')
                ->whereColumn('sales.customer_id', 'customers.id')
                ->where('status', 'completed'),
            ])
            ->orderByDesc('total_purchases')
            ->get();

        return response()->json($customers->map(fn (Customer $customer) => [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'total_purchases' => $customer->total_purchases,
            'sales_count' => $customer->sales_count,
            'due_amount' => round((float) $customer->due_amount, 2),
        ]));
    }
}
