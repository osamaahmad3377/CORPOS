<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'shop' => [
                'name' => 'My Shop',
                'phone' => '',
                'address' => '',
                'email' => '',
                'website' => '',
                'logo' => '',
            ],
            'receipt' => [
                'header' => 'Thank you for shopping with us!',
                'footer' => 'All sales are final after 7 days.',
                'show_tax_line' => '1',
                'paper_width' => '80mm',
            ],
            'barcode' => [
                'default_format' => 'code128',
                'default_label_size' => 'small',
                'show_shop_name' => '1',
            ],
            'business' => [
                'type' => 'general',
            ],
            'product' => [
                'option1_label' => 'Variant',
                'option2_label' => 'Size',
                'default_unit' => 'pcs',
            ],
            'brand' => [
                'primary_color' => '#1bd173',
                'sidebar_color' => '#0f1626',
                'sidebar_logo_size' => '96',
                'theme' => 'light',
                'logo' => '',
                'show_logo_on_receipt' => '1',
            ],
            'loyalty' => [
                'enabled' => '0',
                'points_per_100' => '1',
                'point_value' => '1',
                'min_redeem' => '100',
            ],
            'restaurant' => [
                'tables' => '12',
                'layout' => '',      // empty = tables 1…N in one hall
                'takeaway' => '1',
                'delivery' => '1',
            ],
            'features' => [
                'restaurant' => '0',
                'serials' => '0',
                'expiry' => '0',
            ],
            'tax' => [
                'enabled' => '0',
                'label' => 'GST',
                'percentage' => '0',
            ],
        ];

        foreach ($defaults as $group => $values) {
            foreach ($values as $key => $value) {
                Setting::updateOrCreate(
                    ['key' => "{$group}.{$key}"],
                    ['value' => $value, 'group' => $group]
                );
            }
        }
    }
}
