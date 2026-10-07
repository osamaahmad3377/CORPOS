<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['name' => 'Admin User', 'email' => 'admin@shop.com', 'role' => 'Admin'],
            ['name' => 'Manager User', 'email' => 'manager@shop.com', 'role' => 'Manager'],
            ['name' => 'Cashier User', 'email' => 'cashier@shop.com', 'role' => 'Cashier'],
        ];

        foreach ($users as $user) {
            User::updateOrCreate(
                ['email' => $user['email']],
                [
                    'name' => $user['name'],
                    'password' => Hash::make('password'),
                    'role_id' => Role::where('name', $user['role'])->value('id'),
                    'is_active' => true,
                ]
            );
        }
    }
}
