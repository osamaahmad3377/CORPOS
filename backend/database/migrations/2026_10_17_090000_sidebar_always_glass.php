<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The sidebar is always glass now: a shop that chose a solid colour gets
// glass in that same colour (#rrggbb -> glass:#rrggbb).
return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->where('key', 'brand.sidebar_color')->where('value', 'like', '#%')
            ->update(['value' => DB::raw("'glass:' || value")]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'brand.sidebar_color')->where('value', 'like', 'glass:#%')
            ->update(['value' => DB::raw('substr(value, 7)')]);
    }
};
