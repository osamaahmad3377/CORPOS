<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['name' => 'Admin', 'description' => 'Full access to all modules and settings.'],
            ['name' => 'Manager', 'description' => 'Manages inventory, purchases, sales and reports, no user/settings management.'],
            ['name' => 'Cashier', 'description' => 'Point-of-sale access with own-sales visibility only.'],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(['name' => $role['name']], $role);
        }
    }
}
