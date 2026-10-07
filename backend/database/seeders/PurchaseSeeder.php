<?php

namespace Database\Seeders;

use App\Models\ProductVariant;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class PurchaseSeeder extends Seeder
{
    public function run(): void
    {
        $supplierIds = Supplier::pluck('id');
        $variants = ProductVariant::all();
        $creator = User::whereHas('role', fn ($q) => $q->where('name', 'Admin'))->first();

        if ($supplierIds->isEmpty() || $variants->isEmpty() || ! $creator) {
            return;
        }

        for ($i = 1; $i <= 20; $i++) {
            $poNumber = 'PO-'.(2000 + Purchase::withTrashed()->count());
            $purchaseDate = now()->subDays(rand(1, 180));

            $items = $variants->random(min(rand(1, 5), $variants->count()));
            $totalAmount = 0;

            $purchase = Purchase::create([
                'supplier_id' => $supplierIds->random(),
                'po_number' => $poNumber,
                'purchase_date' => $purchaseDate,
                'total_amount' => 0,
                'discount' => 0,
                'grand_total' => 0,
                'payment_status' => fake()->randomElement(['paid', 'partial', 'pending']),
                'created_by' => $creator->id,
                'created_at' => $purchaseDate,
                'updated_at' => $purchaseDate,
            ]);

            foreach ($items as $variant) {
                $quantity = rand(10, 50);
                $unitPrice = $variant->purchase_price;
                $totalPrice = $quantity * $unitPrice;
                $totalAmount += $totalPrice;

                PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'variant_id' => $variant->id,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                ]);

                StockService::increment($variant, $quantity, 'in', $creator, $purchase, 'Seeded purchase '.$poNumber);
            }

            $purchase->update(['total_amount' => $totalAmount, 'grand_total' => $totalAmount]);
        }
    }
}
