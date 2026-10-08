<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// New default brand colour: CorePOS green. Installs still on the old seeded
// default (indigo, never chosen by the shop) move to the new default.
return new class extends Migration
{
    public function up(): void
    {
        if (! DB::getSchemaBuilder()->hasTable('settings')) {
            return;
        }
        DB::table('settings')->where('key', 'brand.primary_color')->whereIn('value', ['#4f46e5', '#4F46E5', ''])->update(['value' => '#1bd173']);
    }

    public function down(): void
    {
    }
};
