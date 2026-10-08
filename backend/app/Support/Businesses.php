<?php

namespace App\Support;

use App\Models\Role;
use App\Models\Setting;
use App\Services\BusinessTypeService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Several separate businesses on one computer.
 *
 * Business #1 is the original database. Each extra business is its own
 * SQLite file in a "businesses" folder next to it. A request picks its
 * business with the X-Business header (see SelectBusiness middleware); the
 * default connection is then pointed at that file, so every model, report
 * and login token belongs to that business only.
 */
class Businesses
{
    public const HOME = 1;

    private static ?string $homePath = null;

    private static int $current = self::HOME;

    public static function homePath(): string
    {
        return self::$homePath ??= (string) config('database.connections.sqlite.database');
    }

    public static function dir(): string
    {
        return dirname(self::homePath()).DIRECTORY_SEPARATOR.'businesses';
    }

    public static function current(): int
    {
        return self::$current;
    }

    /** The home database, whatever business the request is using. */
    public static function home(): \Illuminate\Database\Connection
    {
        if (! config('database.connections.pos_home')) {
            config(['database.connections.pos_home' => array_merge(config('database.connections.sqlite'), ['database' => self::homePath()])]);
        }

        return DB::connection('pos_home');
    }

    /** All businesses as [id => absolute db path]; makes sure #1 is listed. */
    public static function all(): array
    {
        $home = self::home();
        if (! $home->getSchemaBuilder()->hasTable('businesses')) {
            return [self::HOME => self::homePath()];
        }
        if (! $home->table('businesses')->where('id', self::HOME)->exists()) {
            $home->table('businesses')->insert(['id' => self::HOME, 'file' => null, 'position' => 0, 'created_at' => now(), 'updated_at' => now()]);
        }
        $out = [];
        foreach ($home->table('businesses')->orderBy('position')->orderBy('id')->get() as $row) {
            $out[(int) $row->id] = $row->file ? self::dir().DIRECTORY_SEPARATOR.basename($row->file) : self::homePath();
        }

        return $out;
    }

    public static function path(int $id): ?string
    {
        return self::all()[$id] ?? null;
    }

    /** Point the default connection at business $id. */
    public static function use(int $id): void
    {
        self::homePath();
        $path = $id === self::HOME ? self::homePath() : self::path($id);
        if (! $path || ! is_file($path)) {
            abort(response()->json(['message' => 'This business was not found on this computer.'], 404));
        }
        self::connectTo($path);
        self::$current = $id;
    }

    private static function connectTo(string $path): void
    {
        config(['database.connections.sqlite.database' => $path]);
        DB::purge('sqlite');
        DB::setDefaultConnection('sqlite');
    }

    /** Run $fn inside business $id, then return to the current one. */
    public static function within(int $id, callable $fn)
    {
        $before = self::$current;
        self::use($id);
        try {
            return $fn();
        } finally {
            self::use($before);
        }
    }

    /** Bring a business database up to date (new tables after an update). */
    public static function migrate(int $id): void
    {
        self::within($id, fn () => Artisan::call('migrate', ['--force' => true]));
    }

    /**
     * Create a new, empty business and give the listed people (copied from
     * the current business, same email and password) an account in it.
     */
    public static function create(string $name, string $type, array $userIds): int
    {
        // read the people to copy while still in the current business
        $people = DB::table('users')->whereIn('users.id', $userIds)->whereNull('users.deleted_at')
            ->leftJoin('roles', 'roles.id', '=', 'users.role_id')
            ->get(['users.name', 'users.email', 'users.password', 'roles.name as role'])
            ->map(fn ($u) => (array) $u)->all();

        if (! is_dir(self::dir())) {
            mkdir(self::dir(), 0775, true);
        }
        $file = 'business_'.now()->format('Ymd_His').'_'.Str::lower(Str::random(6)).'.sqlite';
        $path = self::dir().DIRECTORY_SEPARATOR.$file;
        touch($path);

        $home = self::home();
        self::all(); // registers #1
        $id = (int) $home->table('businesses')->insertGetId([
            'file' => $file,
            'position' => (int) $home->table('businesses')->max('position') + 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        try {
            self::within($id, function () use ($name, $type, $people) {
                Artisan::call('migrate', ['--force' => true]);
                foreach ([RoleSeeder::class, PermissionSeeder::class, RolePermissionSeeder::class, SettingSeeder::class] as $seeder) {
                    Artisan::call('db:seed', ['--class' => $seeder, '--force' => true]);
                }
                Setting::updateOrCreate(['key' => 'shop.name'], ['value' => $name, 'group' => 'shop']);
                BusinessTypeService::apply($type);

                $roles = Role::pluck('id', 'name');
                foreach ($people as $p) {
                    DB::table('users')->insert([
                        'name' => $p['name'],
                        'email' => $p['email'],
                        'password' => $p['password'], // already hashed
                        'role_id' => $roles[$p['role'] ?? 'Admin'] ?? $roles['Admin'] ?? null,
                        'is_active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });
        } catch (\Throwable $e) {
            $home->table('businesses')->where('id', $id)->delete();
            DB::purge('sqlite');
            @unlink($path);
            throw $e;
        }

        return $id;
    }

    /** Name, trade, logo and colour of a business, read from its own settings. */
    public static function summary(int $id, string $path): array
    {
        $s = [];
        try {
            $pdo = new \PDO('sqlite:'.$path, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
            $rows = $pdo->query("SELECT key, value FROM settings WHERE key IN ('shop.name','business.type','brand.logo','brand.primary_color')");
            foreach ($rows as $r) {
                $s[$r['key']] = $r['value'];
            }
        } catch (\Throwable) {
            // brand-new / unreadable file: show it with defaults
        }
        $type = $s['business.type'] ?? 'general';

        return [
            'id' => $id,
            'name' => ($s['shop.name'] ?? '') !== '' ? $s['shop.name'] : 'Business '.$id,
            'type' => $type,
            'type_label' => config("pos.business_types.{$type}.label", 'Shop'),
            'logo_url' => ! empty($s['brand.logo']) ? '/storage/'.$s['brand.logo'] : null,
            'brand_color' => preg_match('/^#[0-9a-f]{6}$/i', $s['brand.primary_color'] ?? '') ? $s['brand.primary_color'] : '#1bd173',
            'is_home' => $id === self::HOME,
        ];
    }

    /** Does an active account with this email exist in business $path? */
    public static function hasUser(string $path, string $email): bool
    {
        try {
            $pdo = new \PDO('sqlite:'.$path, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
            $q = $pdo->prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) AND is_active = 1 AND deleted_at IS NULL LIMIT 1');
            $q->execute([$email]);

            return (bool) $q->fetchColumn();
        } catch (\Throwable) {
            return false;
        }
    }
}
