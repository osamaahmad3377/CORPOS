<?php

namespace Database\Seeders;

use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class SaleReturnSeeder extends Seeder
{
    public function run(): void
    {
        $processor = User::whereHas('role', fn ($q) => $q->where('name', 'Admin'))->first();
        $sales = Sale::where('status', 'completed')->with('items')->inRandomOrder()->limit(3)->get();

        if (! $processor || $sales->isEmpty()) {
            return;
        }

        foreach ($sales as $index => $sale) {
            $item = $sale->items->first();

            if (! $item) {
                continue;
            }

            $fullReturn = $index === 0;
            $quantityReturned = $fullReturn ? $item->quantity : max(1, intdiv($item->quantity, 2));
            $unitPrice = $item->quantity > 0 ? $item->total_price / $item->quantity : 0;
            $refundAmount = round($unitPrice * $quantityReturned, 2);

            $saleReturn = SaleReturn::create([
                'sale_id' => $sale->id,
                'return_date' => now()->subDays(rand(0, 10)),
                'reason' => fake()->randomElement(['Wrong size', 'Defective item', 'Customer changed mind']),
                'total_refund' => $refundAmount,
                'processed_by' => $processor->id,
            ]);

            SaleReturnItem::create([
                'return_id' => $saleReturn->id,
                'sale_item_id' => $item->id,
                'variant_id' => $item->variant_id,
                'quantity_returned' => $quantityReturned,
                'refund_amount' => $refundAmount,
            ]);

            $variant = ProductVariant::find($item->variant_id);
            if ($variant) {
                StockService::increment($variant, $quantityReturned, 'in', $processor, $saleReturn, 'Seeded return for '.$sale->invoice_number);
            }

            if ($fullReturn && $sale->items->count() === 1) {
                $sale->update(['status' => 'returned']);
            }
        }
    }
}
