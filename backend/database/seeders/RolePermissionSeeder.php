<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    /**
     * @return array<string, array<int, string>>
     */
    public static function matrix(): array
    {
        $all = array_column(PermissionSeeder::permissions(), 'slug');

        $manager = array_values(array_diff($all, [
            'settings.manage',
            'users.manage',
        ]));

        $cashier = [
            'dashboard.view_own',
            'products.view',
            'barcodes.scan',
            'inventory.view',
            'customers.view',
            'customers.create',
            'sales.create',
            'sales.view_own',
            'cash.manage',
            'quotations.manage',
        ];

        return [
            'Admin' => $all,
            'Manager' => $manager,
            'Cashier' => $cashier,
        ];
    }

    public function run(): void
    {
        foreach (self::matrix() as $roleName => $slugs) {
            $role = Role::where('name', $roleName)->firstOrFail();
            $permissionIds = Permission::whereIn('slug', $slugs)->pluck('id');
            $role->permissions()->sync($permissionIds);
        }
    }
}
