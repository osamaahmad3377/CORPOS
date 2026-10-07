<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Cost of each unit at the moment it was sold, so profit reports stay right
// even after purchase prices change. Older sales get the current cost.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('cost_price', 12, 2)->nullable()->after('unit_price');
        });

        DB::statement('UPDATE sale_items SET cost_price = (SELECT purchase_price FROM product_variants WHERE product_variants.id = sale_items.variant_id)');
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $t) => $t->dropColumn('cost_price'));
    }
};
