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
}
