<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class SaleSeeder extends Seeder
{
    public function run(): void
    {
        $cashiers = User::whereHas('role', fn ($q) => $q->whereIn('name', ['Admin', 'Manager', 'Cashier']))->get();
        $customerIds = Customer::pluck('id');

        if ($cashiers->isEmpty()) {
            return;
        }

        for ($i = 1; $i <= 50; $i++) {
            $this->createSale($cashiers, $customerIds, 'completed', now()->subDays(rand(0, 180)));
        }

        for ($i = 1; $i <= 5; $i++) {
            $this->createSale($cashiers, $customerIds, 'held', now()->subDays(rand(0, 3)));
        }
    }

    private function createSale($cashiers, $customerIds, string $status, $saleDate): void
    {
        $variants = ProductVariant::where('stock_qty', '>', 2)->inRandomOrder()->limit(rand(1, 4))->get();

        if ($variants->isEmpty()) {
            return;
        }

        $cashier = $cashiers->random();
        $invoiceNumber = 'INV-'.(1000 + Sale::withTrashed()->count());

        $subtotal = 0;
        $lineItems = [];

        foreach ($variants as $variant) {
            $quantity = min(rand(1, 3), $variant->stock_qty);
            $unitPrice = $variant->selling_price;
            $lineTotal = $quantity * $unitPrice;
            $subtotal += $lineTotal;

            $lineItems[] = ['variant' => $variant, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'total_price' => $lineTotal];
        }

        $discountAmount = fake()->boolean(20) ? round($subtotal * 0.05, 2) : 0;
        $grandTotal = $subtotal - $discountAmount;
        $paymentReceived = $status === 'completed' ? $grandTotal : 0;

        $sale = Sale::create([
            'invoice_number' => $invoiceNumber,
            'customer_id' => $customerIds->isNotEmpty() && fake()->boolean(60) ? $customerIds->random() : null,
            'cashier_id' => $cashier->id,
            'sale_date' => $saleDate,
            'subtotal' => $subtotal,
            'discount_amount' => $discountAmount,
            'tax_amount' => 0,
            'grand_total' => $grandTotal,
            'payment_method' => fake()->randomElement(['cash', 'card', 'other']),
            'payment_received' => $paymentReceived,
            'change_amount' => 0,
            'status' => $status,
            'created_at' => $saleDate,
            'updated_at' => $saleDate,
        ]);

        foreach ($lineItems as $item) {
            SaleItem::create([
                'sale_id' => $sale->id,
                'variant_id' => $item['variant']->id,
                'quantity' => $item['quantity'],
                'unit_price' => $item['unit_price'],
                'discount_per_item' => 0,
                'total_price' => $item['total_price'],
            ]);

            if ($status === 'completed') {
                StockService::decrement($item['variant'], $item['quantity'], 'out', $cashier, $sale, 'Seeded sale '.$invoiceNumber);
            }
        }

        if ($status === 'completed' && $sale->customer_id) {
            Customer::where('id', $sale->customer_id)->increment('total_purchases', $grandTotal);
        }
    }
}
