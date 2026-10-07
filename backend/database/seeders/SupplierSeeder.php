<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            ['name' => 'ABC Textiles', 'company' => 'ABC Textiles Pvt Ltd', 'phone' => '03001234567', 'city' => 'Karachi'],
            ['name' => 'Fabric World', 'company' => 'Fabric World Co', 'phone' => '03011234567', 'city' => 'Lahore'],
            ['name' => 'Style Hub Suppliers', 'company' => 'Style Hub', 'phone' => '03021234567', 'city' => 'Faisalabad'],
            ['name' => 'Prime Garments', 'company' => 'Prime Garments Ltd', 'phone' => '03031234567', 'city' => 'Karachi'],
            ['name' => 'Elite Wholesale', 'company' => 'Elite Wholesale Traders', 'phone' => '03041234567', 'city' => 'Islamabad'],
        ];

        foreach ($suppliers as $supplier) {
            Supplier::updateOrCreate(
                ['phone' => $supplier['phone']],
                array_merge($supplier, ['country' => 'Pakistan', 'is_active' => true])
            );
        }
    }
}
