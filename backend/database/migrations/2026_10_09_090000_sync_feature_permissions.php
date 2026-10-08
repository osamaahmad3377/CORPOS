<?php

use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Shops installed before the cash-drawer / expenses / quotations / offers
 * modules: add the new permissions and give them to the standard roles.
 * (Fresh installs get them from the seeders.)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! DB::getSchemaBuilder()->hasTable('roles') || ! DB::table('roles')->exists()) {
            return; // fresh install — pos:install seeds everything afterwards
        }

        foreach (PermissionSeeder::permissions() as $p) {
            DB::table('permissions')->updateOrInsert(['slug' => $p['slug']], $p + ['created_at' => now(), 'updated_at' => now()]);
        }

        $new = ['cash.manage', 'cash.view_all', 'expenses.manage', 'quotations.manage', 'promotions.manage'];
        foreach (RolePermissionSeeder::matrix() as $roleName => $slugs) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) {
                continue;
            }
            foreach (array_intersect($slugs, $new) as $slug) {
                $permId = DB::table('permissions')->where('slug', $slug)->value('id');
                DB::table('role_permissions')->updateOrInsert(['role_id' => $roleId, 'permission_id' => $permId]);
            }
        }
    }

    public function down(): void
    {
    }
};
