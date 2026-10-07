<?php

namespace Database\Seeders;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\BarcodeGenerator;
use App\Services\SkuGenerator;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ProductSeeder extends Seeder
{
    private const NAMES = [
        'Classic Cotton T-Shirt', 'Slim Fit Jeans', 'Denim Jacket', 'Formal Dress Shirt',
        'Casual Polo Shirt', 'Hooded Sweatshirt', 'Chino Trousers', 'Summer Shorts',
        'Winter Parka', 'Linen Kurta', 'Graphic Print Tee', 'Sports Track Pants',
        'Woolen Sweater', 'Bomber Jacket', 'Cargo Pants', 'Striped Polo',
        'Kids Cartoon T-Shirt', 'Kids Denim Overalls', 'Girls Frock', 'Boys Shorts Set',
        'Leather Belt', 'Canvas Cap', 'Wool Scarf', 'Cotton Socks Pack',
        'Formal Blazer', 'Waistcoat', 'Maxi Dress', 'Palazzo Pants',
        'Fleece Hoodie', 'Rain Jacket',
    ];

    private const COLORS = ['Red', 'Blue', 'Black', 'White', 'Green', 'Grey', 'Navy'];

    private const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

    public function run(): void
    {
        $leafCategories = Category::whereDoesntHave('children')->get();
        $brandIds = Brand::pluck('id');
        $admin = User::whereHas('role', fn ($q) => $q->where('name', 'Admin'))->first();

        if ($leafCategories->isEmpty() || $brandIds->isEmpty() || ! $admin) {
            return;
        }

        foreach (self::NAMES as $index => $name) {
            $slug = Str::slug($name).'-'.($index + 1);

            if (Product::where('slug', $slug)->exists()) {
                continue;
            }

            $product = Product::create([
                'name' => $name,
                'slug' => $slug,
                'category_id' => $leafCategories->random()->id,
                'brand_id' => fake()->boolean(80) ? $brandIds->random() : null,
                'description' => fake()->sentence(12),
                'is_active' => true,
            ]);

            $colors = collect(self::COLORS)->shuffle()->take(rand(1, 3))->values();
            $sizes = collect(self::SIZES)->shuffle()->take(rand(2, 3))->values();

            $purchasePrice = rand(300, 2000);
            $sellingPrice = (int) round($purchasePrice * 1.6);

            foreach ($colors as $color) {
                foreach ($sizes as $size) {
                    $variant = ProductVariant::create([
                        'product_id' => $product->id,
                        'color' => $color,
                        'size' => $size,
                        'sku' => SkuGenerator::generate($product, $color, $size),
                        'barcode' => 'TMP-'.Str::random(10),
                        'purchase_price' => $purchasePrice,
                        'selling_price' => $sellingPrice,
                        'stock_qty' => 0,
                        'low_stock_threshold' => 5,
                        'is_active' => true,
                    ]);

                    BarcodeGenerator::assignToVariant($product, $variant);
                    StockService::increment($variant, rand(10, 100), 'in', $admin, null, 'Initial stock on variant creation');
                }
            }
        }
    }
}
