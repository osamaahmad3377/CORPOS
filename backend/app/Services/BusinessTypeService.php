<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Setting;
use Illuminate\Support\Str;

/**
 * Applies a business-type preset (config/pos.php business_types): option
 * labels, default unit, which feature modules are on, trade defaults, and the
 * starter categories that don't exist yet. Used at first setup and when the
 * owner switches type in Settings.
 */
class BusinessTypeService
{
    public static function apply(string $type, bool $addCategories = true): void
    {
        $preset = config("pos.business_types.{$type}");
        if (! $preset) {
            return;
        }

        $settings = [
            'business.type' => $type,
            'product.option1_label' => $preset['options'][0],
            'product.option2_label' => $preset['options'][1],
            'product.default_unit' => $preset['unit'],
        ];
        foreach (config('pos.features') as $feature) {
            $settings["features.{$feature}"] = in_array($feature, $preset['features'] ?? [], true) ? '1' : '0';
        }
        if ($type === 'restaurant') {
            $settings['restaurant.tables'] = Setting::where('key', 'restaurant.tables')->value('value') ?: '12';
        }
        foreach ($settings as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['value' => (string) $value, 'group' => Str::before($key, '.')]);
        }

        if ($addCategories) {
            foreach ($preset['categories'] as $parent => $children) {
                $root = Category::whereNull('parent_id')->where('name', $parent)->first()
                    ?? Category::create(['name' => $parent, 'slug' => self::slug($parent), 'is_active' => true]);
                foreach ($children as $child) {
                    if (! Category::where('parent_id', $root->id)->where('name', $child)->exists()) {
                        Category::create(['name' => $child, 'slug' => self::slug("{$parent} {$child}"), 'parent_id' => $root->id, 'is_active' => true]);
                    }
                }
            }
        }
    }

    private static function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'category';
        $slug = $base;
        for ($i = 2; Category::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
