<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Kitchen stock for restaurants: raw materials (chicken, flour, buns…), the
// recipe of each dish (how much of each it uses), and every change to stock.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('unit', 20)->default('kg'); // kg | g | litre | ml | piece | dozen | packet
            $table->decimal('stock_qty', 14, 3)->default(0); // may go below 0: a dish is never refused
            $table->decimal('alert_qty', 14, 3)->default(0); // warn at or below this
            $table->decimal('cost_per_unit', 12, 2)->default(0); // average buying price
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('recipe_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->decimal('quantity', 14, 4); // in the ingredient's unit, per 1 dish
            $table->timestamps();
            $table->unique(['variant_id', 'ingredient_id']);
        });

        Schema::create('ingredient_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->string('type', 20); // purchase | sale | count | waste | correction
            $table->decimal('quantity_change', 14, 3);
            $table->decimal('balance_after', 14, 3);
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();
            $table->index(['ingredient_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_movements');
        Schema::dropIfExists('recipe_items');
        Schema::dropIfExists('ingredients');
    }
};
