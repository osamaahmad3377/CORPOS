<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Universal retail: the catalog was built around clothing (every variant had
 * a mandatory colour + size, stock came in whole pieces only). Any shop type
 * can now use it:
 *  - variant options (stored in the color/size columns, labelled per business
 *    type via the product.option1_label / option2_label settings) are optional
 *  - products carry a unit (pcs, kg, litre, metre, …) and quantities can be
 *    fractional (1.5 kg) everywhere stock moves
 *  - payment method is free text validated against config('pos.payment_methods')
 *    instead of a fixed enum, so JazzCash/Easypaisa/bank transfer fit
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('unit', 20)->default('pcs')->after('description');
        });

        Schema::table('product_variants', function (Blueprint $table) {
            $table->string('color')->nullable()->change();
            $table->string('size')->nullable()->change();
            $table->decimal('stock_qty', 12, 3)->default(0)->change();
            $table->decimal('low_stock_threshold', 12, 3)->default(5)->change();
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->change();
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->change();
        });

        Schema::table('sale_return_items', function (Blueprint $table) {
            $table->decimal('quantity_returned', 12, 3)->change();
        });

        Schema::table('purchase_return_items', function (Blueprint $table) {
            $table->decimal('quantity_returned', 12, 3)->change();
        });

        Schema::table('stock_adjustments', function (Blueprint $table) {
            $table->decimal('quantity_before', 12, 3)->change();
            $table->decimal('quantity_change', 12, 3)->change();
            $table->decimal('quantity_after', 12, 3)->change();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->string('payment_method', 30)->change();
        });
    }

    public function down(): void
    {
        // Narrowing back to whole-number quantities / a fixed enum would
        // silently corrupt any fractional or new-method data — not reversible.
    }
};
