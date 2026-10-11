<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The frosted glass sidebar is the new standard look. Shops still on the old
// standard dark sidebar move to it; a colour the shop picked itself stays.
return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->where('key', 'brand.sidebar_color')->where('value', '#0f1626')->update(['value' => 'glass']);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'brand.sidebar_color')->where('value', 'glass')->update(['value' => '#0f1626']);
    }
};
