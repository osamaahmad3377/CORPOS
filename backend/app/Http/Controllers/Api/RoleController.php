<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;

class RoleController extends Controller
{
    public function index()
    {
        return response()->json(
            Role::orderBy('id')->get(['id', 'name', 'description'])
        );
    }
}
