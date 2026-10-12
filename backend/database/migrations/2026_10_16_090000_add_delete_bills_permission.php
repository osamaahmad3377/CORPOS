<?php

use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Delete Bills" (sales.delete) for shops installed before it existed: add the
 * permission and give it to the roles that get it on a fresh install (Admin).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! DB::getSchemaBuilder()->hasTable('roles') || ! DB::table('roles')->exists()) {
            return; // fresh install — pos:install seeds everything afterwards
        }

        foreach (PermissionSeeder::permissions() as $p) {
            if ($p['slug'] === 'sales.delete') {
                DB::table('permissions')->updateOrInsert(['slug' => $p['slug']], $p + ['created_at' => now(), 'updated_at' => now()]);
            }
        }
        $permId = DB::table('permissions')->where('slug', 'sales.delete')->value('id');
        foreach (RolePermissionSeeder::matrix() as $roleName => $slugs) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if ($roleId && in_array('sales.delete', $slugs, true)) {
                DB::table('role_permissions')->updateOrInsert(['role_id' => $roleId, 'permission_id' => $permId]);
            }
        }
    }

    public function down(): void
    {
        $permId = DB::table('permissions')->where('slug', 'sales.delete')->value('id');
        if ($permId) {
            DB::table('role_permissions')->where('permission_id', $permId)->delete();
            DB::table('permissions')->where('id', $permId)->delete();
        }
    }
};
