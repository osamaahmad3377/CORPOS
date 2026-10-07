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

        $data = $query->groupBy('products.id', 'products.name')
            ->selectRaw('products.id, products.name,
                SUM(sale_items.quantity - COALESCE(returns_agg.qty_returned, 0)) as quantity_sold,
                SUM(sale_items.total_price - COALESCE(returns_agg.amount_returned, 0)) as revenue')
            ->orderByDesc('revenue')
            ->get();

        return response()->json($data);
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
        $customers = Customer::withCount('sales')
            ->orderByDesc('total_purchases')
            ->get();

        return response()->json($customers->map(fn (Customer $customer) => [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'total_purchases' => $customer->total_purchases,
            'sales_count' => $customer->sales_count,
        ]));
    }
}
