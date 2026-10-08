<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wholesale price level + loyalty points + offer tracking on sale lines.
 * Every column is nullable or has a default so existing shops upgrade cleanly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            if (! Schema::hasColumn('product_variants', 'wholesale_price')) {
                $table->decimal('wholesale_price', 12, 2)->nullable()->after('selling_price');
            }
        });

        Schema::table('customers', function (Blueprint $table) {
            if (! Schema::hasColumn('customers', 'price_level')) {
                $table->string('price_level', 20)->default('retail');
            }
            if (! Schema::hasColumn('customers', 'loyalty_points')) {
                $table->unsignedInteger('loyalty_points')->default(0);
            }
        });

        Schema::table('sales', function (Blueprint $table) {
            if (! Schema::hasColumn('sales', 'price_level')) {
                $table->string('price_level', 20)->default('retail');
            }
            if (! Schema::hasColumn('sales', 'points_earned')) {
                $table->unsignedInteger('points_earned')->default(0);
            }
            if (! Schema::hasColumn('sales', 'points_redeemed')) {
                $table->unsignedInteger('points_redeemed')->default(0);
            }
            if (! Schema::hasColumn('sales', 'points_discount')) {
                $table->decimal('points_discount', 12, 2)->default(0);
            }
            if (! Schema::hasColumn('sales', 'points_reversed')) {
                $table->unsignedInteger('points_reversed')->default(0);
            }
        });

        Schema::table('sale_items', function (Blueprint $table) {
            if (! Schema::hasColumn('sale_items', 'promotion_id')) {
                $table->unsignedBigInteger('promotion_id')->nullable()->index();
            }
            if (! Schema::hasColumn('sale_items', 'promo_discount')) {
                $table->decimal('promo_discount', 12, 2)->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $t) => $t->dropColumn(['promotion_id', 'promo_discount']));
        Schema::table('sales', fn (Blueprint $t) => $t->dropColumn(['price_level', 'points_earned', 'points_redeemed', 'points_discount', 'points_reversed']));
        Schema::table('customers', fn (Blueprint $t) => $t->dropColumn(['price_level', 'loyalty_points']));
        Schema::table('product_variants', fn (Blueprint $t) => $t->dropColumn('wholesale_price'));
    }
};
