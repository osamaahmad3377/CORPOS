<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SettingController extends Controller
{
    /**
     * Every setting key this endpoint is allowed to write, with its
     * validation rule. Anything outside this list is silently dropped —
     * settings are read by key throughout the app (tax math, receipts,
     * barcode printing), so an unvalidated arbitrary key/value here can
     * corrupt those calculations (e.g. a non-numeric tax.percentage turns
     * every sale total into NaN) or plant unrecognised junk rows.
     */
    private const SCHEMA = [
        'shop' => [
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:500'],
            'email' => ['nullable', 'string', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'logo' => ['nullable', 'string', 'max:255'],
        ],
        'receipt' => [
            'header' => ['nullable', 'string', 'max:500'],
            'footer' => ['nullable', 'string', 'max:500'],
            'show_tax_line' => ['nullable', 'in:0,1'],
            'paper_width' => ['nullable', 'in:58mm,80mm'],
        ],
        'barcode' => [
            'default_format' => ['nullable', 'in:code128,ean13'],
            'default_label_size' => ['nullable', 'in:small,large'],
            'show_shop_name' => ['nullable', 'in:0,1'],
        ],
        'business' => [
            'type' => ['nullable', 'string', 'max:50'],
        ],
        'product' => [
            'option1_label' => ['nullable', 'string', 'max:40'],
            'option2_label' => ['nullable', 'string', 'max:40'],
            'default_unit' => ['nullable', 'string', 'max:20'],
        ],
        // White-label look: brand colour + logo (logo is set via uploadLogo()).
        'brand' => [
            'primary_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'sidebar_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme' => ['nullable', 'in:light,dark,system'],
            'show_logo_on_receipt' => ['nullable', 'in:0,1'],
        ],
        // Loyalty points: earn per Rs 100 spent, each point worth Rs X.
        'loyalty' => [
            'enabled' => ['nullable', 'in:0,1'],
            'points_per_100' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'point_value' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'min_redeem' => ['nullable', 'integer', 'min:0', 'max:1000000'],
        ],
        // Dining areas and their tables, as JSON (see normalizeLayout()).
        'restaurant' => [
            'tables' => ['nullable', 'integer', 'min:0', 'max:300'],
            'layout' => ['nullable', 'string', 'max:50000', 'json'],
            'takeaway' => ['nullable', 'in:0,1'],
            'delivery' => ['nullable', 'in:0,1'],
        ],
        'features' => [
            'restaurant' => ['nullable', 'in:0,1'],
            'serials' => ['nullable', 'in:0,1'],
            'expiry' => ['nullable', 'in:0,1'],
        ],
        'tax' => [
            'enabled' => ['nullable', 'in:0,1'],
            'label' => ['nullable', 'string', 'max:50'],
            'percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ],
    ];

    public function index()
    {
        $settings = Setting::all();
        $grouped = [];

        foreach ($settings as $setting) {
            $key = Str::after($setting->key, "{$setting->group}.");
            $grouped[$setting->group][$key] = $setting->value;
        }

        return response()->json($grouped);
    }

    /** Switch business type and apply its preset (labels, unit, modules, categories). */
    public function applyBusinessType(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', 'string', \Illuminate\Validation\Rule::in(array_keys(config('pos.business_types')))],
            'add_categories' => ['sometimes', 'boolean'],
        ]);
        \App\Services\BusinessTypeService::apply($data['type'], $data['add_categories'] ?? true);
        if ($data['type'] === 'restaurant') {
            // dishes are made to order — stop asking for stock counts
            \App\Models\Product::query()->update(['track_stock' => false]);
        }
        \App\Services\ActivityLogger::log($request->user(), 'update', 'settings', "Switched business type to {$data['type']}.");

        return $this->index();
    }

    /** Shop logo shown in the menu, login, home and on receipts. */
    public function uploadLogo(Request $request)
    {
        $request->validate(['logo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048']]);

        $old = Setting::where('key', 'brand.logo')->value('value');
        $path = $request->file('logo')->store('branding', 'public');
        Setting::updateOrCreate(['key' => 'brand.logo'], ['value' => $path, 'group' => 'brand']);
        if ($old && $old !== $path) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($old);
        }

        return $this->index();
    }

    public function removeLogo()
    {
        $old = Setting::where('key', 'brand.logo')->value('value');
        if ($old) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($old);
        }
        Setting::updateOrCreate(['key' => 'brand.logo'], ['value' => '', 'group' => 'brand']);

        return $this->index();
    }

    /**
     * Restaurant floor plan: [{name, tables: [{no, seats}]}]. Table numbers are
     * what sales.table_no stores, so they must be short and unique.
     */
    private static function normalizeLayout($layout): array
    {
        $fail = fn (string $msg) => throw \Illuminate\Validation\ValidationException::withMessages(['restaurant.layout' => $msg]);
        if (! is_array($layout) || ! array_is_list($layout)) {
            $fail('The tables list is not valid.');
        }
        $seen = [];
        $out = [];
        foreach (array_slice($layout, 0, 30) as $area) {
            $name = trim((string) ($area['name'] ?? ''));
            $tables = [];
            foreach (is_array($area['tables'] ?? null) ? $area['tables'] : [] as $table) {
                $no = trim((string) ($table['no'] ?? ''));
                if ($no === '') {
                    $fail('Every table needs a name or number.');
                }
                if (mb_strlen($no) > 20) {
                    $fail("Table name \"{$no}\" is too long (20 letters max).");
                }
                $key = mb_strtolower($no);
                if (isset($seen[$key])) {
                    $fail("Two tables are both called \"{$no}\". Give each table its own name.");
                }
                $seen[$key] = true;
                $tables[] = ['no' => $no, 'seats' => max(0, min(99, (int) ($table['seats'] ?? 0)))];
            }
            $out[] = ['name' => mb_substr($name, 0, 40), 'tables' => $tables];
        }
        if (count($seen) > 300) {
            $fail('At most 300 tables.');
        }

        return $out;
    }

    public function update(Request $request)
    {
        $rules = [];
        foreach ($request->all() as $group => $values) {
            if (! is_array($values) || ! isset(self::SCHEMA[$group])) {
                continue;
            }

            foreach (array_keys($values) as $key) {
                if (isset(self::SCHEMA[$group][$key])) {
                    $rules["{$group}.{$key}"] = self::SCHEMA[$group][$key];
                }
            }
        }

        $validated = $request->validate($rules);

        if (! empty($validated['restaurant']['layout'])) {
            $layout = self::normalizeLayout(json_decode($validated['restaurant']['layout'], true));
            $validated['restaurant']['layout'] = json_encode($layout, JSON_UNESCAPED_UNICODE);
            $validated['restaurant']['tables'] = array_sum(array_map(fn ($a) => count($a['tables']), $layout));
        }

        foreach ($validated as $group => $values) {
            foreach ($values as $key => $value) {
                // A cleared field arrives as null (ConvertEmptyStringsToNull);
                // store it as an empty string, not the literal text "null"
                // that would then print on receipts and labels.
                $stored = $value === null ? '' : (is_scalar($value) ? (string) $value : json_encode($value));

                Setting::updateOrCreate(
                    ['key' => "{$group}.{$key}"],
                    ['value' => $stored, 'group' => $group]
                );
            }
        }

        return $this->index();
    }
}
