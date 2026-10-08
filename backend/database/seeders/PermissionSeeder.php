<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * @return array<int, array{name: string, slug: string, module: string}>
     */
    public static function permissions(): array
    {
        return [
            ['name' => 'View Dashboard (Own)', 'slug' => 'dashboard.view_own', 'module' => 'dashboard'],
            ['name' => 'View Dashboard (All)', 'slug' => 'dashboard.view_all', 'module' => 'dashboard'],

            ['name' => 'View Products', 'slug' => 'products.view', 'module' => 'products'],
            ['name' => 'Create Products', 'slug' => 'products.create', 'module' => 'products'],
            ['name' => 'Edit Products', 'slug' => 'products.edit', 'module' => 'products'],
            ['name' => 'Delete Products', 'slug' => 'products.delete', 'module' => 'products'],
            ['name' => 'Manage Categories', 'slug' => 'categories.manage', 'module' => 'products'],
            ['name' => 'Manage Brands', 'slug' => 'brands.manage', 'module' => 'products'],

            ['name' => 'Manage Barcodes', 'slug' => 'barcodes.manage', 'module' => 'barcodes'],
            ['name' => 'Scan Barcodes', 'slug' => 'barcodes.scan', 'module' => 'barcodes'],

            ['name' => 'View Purchases', 'slug' => 'purchases.view', 'module' => 'purchases'],
            ['name' => 'Manage Purchases', 'slug' => 'purchases.manage', 'module' => 'purchases'],
            ['name' => 'Process Purchase Returns', 'slug' => 'purchases.return', 'module' => 'purchases'],
            ['name' => 'Manage Suppliers', 'slug' => 'suppliers.manage', 'module' => 'suppliers'],

            ['name' => 'View Inventory', 'slug' => 'inventory.view', 'module' => 'inventory'],
            ['name' => 'Adjust Inventory', 'slug' => 'inventory.adjust', 'module' => 'inventory'],

            ['name' => 'View Customers', 'slug' => 'customers.view', 'module' => 'customers'],
            ['name' => 'Create Customers', 'slug' => 'customers.create', 'module' => 'customers'],
            ['name' => 'Edit Customers', 'slug' => 'customers.edit', 'module' => 'customers'],
            ['name' => 'Delete Customers', 'slug' => 'customers.delete', 'module' => 'customers'],

            ['name' => 'Create Sales', 'slug' => 'sales.create', 'module' => 'sales'],
            ['name' => 'View Own Sales', 'slug' => 'sales.view_own', 'module' => 'sales'],
            ['name' => 'View All Sales', 'slug' => 'sales.view_all', 'module' => 'sales'],
            ['name' => 'Process Sale Returns', 'slug' => 'sales.return', 'module' => 'sales'],

            ['name' => 'View Reports', 'slug' => 'reports.view', 'module' => 'reports'],
            ['name' => 'View Activity Logs', 'slug' => 'activity_logs.view', 'module' => 'activity_logs'],

            ['name' => 'Open & Close Cash Drawer', 'slug' => 'cash.manage', 'module' => 'cash'],
            ['name' => 'View All Cash Drawers', 'slug' => 'cash.view_all', 'module' => 'cash'],
            ['name' => 'Manage Expenses', 'slug' => 'expenses.manage', 'module' => 'expenses'],
            ['name' => 'Manage Quotations', 'slug' => 'quotations.manage', 'module' => 'quotations'],
            ['name' => 'Manage Offers & Loyalty', 'slug' => 'promotions.manage', 'module' => 'promotions'],

            ['name' => 'Manage Settings', 'slug' => 'settings.manage', 'module' => 'settings'],
            ['name' => 'Manage Users', 'slug' => 'users.manage', 'module' => 'users'],
        ];
    }

    public function run(): void
    {
        foreach (self::permissions() as $permission) {
            Permission::updateOrCreate(['slug' => $permission['slug']], $permission);
        }
    }
}
