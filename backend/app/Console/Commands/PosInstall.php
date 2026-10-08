<?php

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * First-run setup for the desktop build: creates the schema, the base
 * roles/permissions/settings, and the shop owner's Admin account.
 *
 * The desktop launcher pipes the owner's details in as JSON on stdin (so the
 * password never shows up in the process list):
 *   {"shop_name": "...", "shop_phone": "...", "shop_address": "...", "business_type": "grocery",
 *    "admin_name": "...", "admin_email": "...", "admin_password": "..."}
 */
class PosInstall extends Command
{
    protected $signature = 'pos:install {--status : Only print whether the POS is already set up}';

    protected $description = 'Set up a fresh desktop POS database and the owner account';

    public function handle(): int
    {
        if ($this->option('status')) {
            $this->line(json_encode([
                'installed' => $this->isInstalled(),
                'business_types' => collect(config('pos.business_types'))
                    ->map(fn ($t, $code) => ['code' => $code, 'label' => $t['label']])->values(),
            ]));

            return self::SUCCESS;
        }

        $this->call('migrate', ['--force' => true]);

        if ($this->isInstalled()) {
            $this->line(json_encode(['ok' => true, 'already_installed' => true]));

            return self::SUCCESS;
        }

        $input = json_decode((string) stream_get_contents(STDIN), true) ?: [];

        $validator = Validator::make($input, [
            'shop_name' => ['required', 'string', 'max:255'],
            'business_type' => ['nullable', 'string', Rule::in(array_keys(config('pos.business_types')))],
            'shop_phone' => ['nullable', 'string', 'max:50'],
            'shop_address' => ['nullable', 'string', 'max:500'],
            'admin_name' => ['required', 'string', 'max:255'],
            'admin_email' => ['required', 'email', 'max:255'],
            'admin_password' => ['required', 'string', Password::min(8)->mixedCase()->numbers()],
        ]);

        if ($validator->fails()) {
            $this->line(json_encode(['ok' => false, 'errors' => $validator->errors()->all()]));

            return self::FAILURE;
        }

        $data = $validator->validated();

        DB::transaction(function () use ($data) {
            $this->callSilently('db:seed', ['--class' => RoleSeeder::class, '--force' => true]);
            $this->callSilently('db:seed', ['--class' => PermissionSeeder::class, '--force' => true]);
            $this->callSilently('db:seed', ['--class' => RolePermissionSeeder::class, '--force' => true]);
            $this->callSilently('db:seed', ['--class' => SettingSeeder::class, '--force' => true]);

            foreach (['name' => 'shop_name', 'phone' => 'shop_phone', 'address' => 'shop_address'] as $key => $field) {
                Setting::updateOrCreate(
                    ['key' => "shop.{$key}"],
                    ['value' => (string) ($data[$field] ?? ''), 'group' => 'shop']
                );
            }

            \App\Services\BusinessTypeService::apply($data['business_type'] ?? 'general');

            User::create([
                'name' => $data['admin_name'],
                'email' => strtolower($data['admin_email']),
                'password' => $data['admin_password'],
                'role_id' => Role::where('name', 'Admin')->value('id'),
                'is_active' => true,
            ]);
        });

        $this->line(json_encode(['ok' => true]));

        return self::SUCCESS;
    }

    private function isInstalled(): bool
    {
        try {
            return DB::getSchemaBuilder()->hasTable('users') && User::withTrashed()->exists();
        } catch (\Throwable) {
            return false;
        }
    }
}
