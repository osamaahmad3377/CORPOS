<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quotations / estimates: a priced list of items given to a customer before
 * they buy. No stock moves and no money is recorded — the POS later turns a
 * quotation into a real sale and marks it converted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('quotations')) {
            Schema::create('quotations', function (Blueprint $table) {
                $table->id();
                $table->string('quote_number')->unique();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                // walk-in customers who aren't saved in the customer list
                $table->string('customer_name')->nullable();
                $table->string('customer_phone', 30)->nullable();
                $table->date('valid_until')->nullable();
                $table->decimal('subtotal', 12, 2)->default(0);
                $table->decimal('discount_amount', 12, 2)->default(0);
                $table->decimal('tax_amount', 12, 2)->default(0);
                $table->decimal('grand_total', 12, 2)->default(0);
                $table->text('notes')->nullable();
                $table->string('status', 20)->default('draft'); // draft|sent|converted|expired
                $table->foreignId('converted_sale_id')->nullable()->constrained('sales')->nullOnDelete();
                $table->timestamp('converted_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index('status');
                $table->index('valid_until');
                $table->index('created_at');
            });
        }

        if (! Schema::hasTable('quotation_items')) {
            Schema::create('quotation_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('quotation_id')->constrained('quotations')->cascadeOnDelete();
                $table->foreignId('variant_id')->constrained('product_variants')->restrictOnDelete();
                $table->decimal('quantity', 12, 3);
                $table->decimal('unit_price', 12, 2);
                $table->decimal('discount_per_item', 12, 2)->default(0);
                $table->decimal('total_price', 12, 2);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('quotation_items');
        Schema::dropIfExists('quotations');
    }
};
