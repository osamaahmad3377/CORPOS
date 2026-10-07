<?php

namespace Database\Seeders;

use App\Models\ProductVariant;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class StockAdjustmentSeeder extends Seeder
{
    public function run(): void
    {
        $adjuster = User::whereHas('role', fn ($q) => $q->where('name', 'Admin'))->first();
        $variants = ProductVariant::inRandomOrder()->limit(10)->get();

        if (! $adjuster || $variants->isEmpty()) {
            return;
        }

        $reasons = [
            'damaged' => 'Damaged during handling',
            'adjustment' => 'Physical stock count correction',
        ];

        foreach ($variants as $variant) {
            $type = fake()->randomElement(['damaged', 'adjustment']);

            if ($type === 'damaged') {
                $quantity = min(rand(1, 3), $variant->stock_qty);
                if ($quantity < 1) {
                    continue;
                }
                StockService::decrement($variant, $quantity, 'damaged', $adjuster, null, $reasons['damaged']);
            } else {
                $delta = rand(-2, 2);
                if ($delta === 0) {
                    continue;
                }
                StockService::adjust($variant, $delta, 'adjustment', $adjuster, $reasons['adjustment']);
            }
        }
    }
}
