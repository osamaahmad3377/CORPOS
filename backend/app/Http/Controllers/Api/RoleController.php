<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;

class RoleController extends Controller
{
    public function index()
    {
        // Permissions are included so the Users screen can show what each
        // role is allowed to do before an admin assigns it.
        $roles = Role::with(['permissions' => fn ($q) => $q->orderBy('id')])
            ->withCount('users')
            ->orderBy('id')
            ->get();

        return response()->json($roles->map(fn (Role $role) => [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'users_count' => $role->users_count,
            'permissions' => $role->permissions->map(fn ($p) => [
                'slug' => $p->slug,
                'name' => $p->name,
                'module' => $p->module,
            ])->values(),
        ]));
    }
}
