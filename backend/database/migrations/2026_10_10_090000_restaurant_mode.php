<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Restaurant mode:
 *  - products.track_stock: dishes made to order have no stock to count
 *  - sales.kitchen_status: new → preparing → ready (kitchen screen)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'track_stock')) {
            Schema::table('products', function (Blueprint $table) {
                $table->boolean('track_stock')->default(true)->after('unit');
            });
            // existing restaurant installs: menu items stop needing stock
            if (DB::table('settings')->where('key', 'business.type')->value('value') === 'restaurant') {
                DB::table('products')->update(['track_stock' => false]);
            }
        }
        if (! Schema::hasColumn('sales', 'kitchen_status')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->string('kitchen_status', 20)->nullable()->after('table_no');
            });
        }
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $t) => $t->dropColumn('kitchen_status'));
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('track_stock'));
    }
};
