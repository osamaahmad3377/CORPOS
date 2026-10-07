<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Trade-specific features, switched on per product (and per shop in
 * Settings → Features):
 *  - Serial / IMEI / chassis numbers: every unit of a serial-tracked product
 *    is a row in product_serials; buying adds rows, selling marks them sold.
 *  - Batches & expiry: purchases of expiry-tracked products create batches;
 *    sales draw from the earliest-expiring batch first (FEFO), and the draw is
 *    recorded so a return goes back to the same batch.
 *  - Restaurant: a sale can be dine-in / takeaway / delivery with a table no.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('track_serial')->default(false)->after('unit');
            $table->boolean('track_expiry')->default(false)->after('track_serial');
            $table->unsignedSmallInteger('warranty_months')->nullable()->after('track_expiry');
        });

        Schema::create('product_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->string('serial', 100)->unique();
            $table->enum('status', ['in_stock', 'sold', 'returned_to_supplier', 'damaged'])->default('in_stock');
            $table->foreignId('purchase_id')->nullable()->constrained('purchases')->nullOnDelete();
            $table->foreignId('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();
            $table->timestamp('sold_at')->nullable();
            $table->timestamps();

            $table->index(['variant_id', 'status']);
        });

        Schema::create('product_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->string('batch_no', 100)->nullable();
            $table->date('expiry_date')->nullable();
            $table->decimal('quantity', 12, 3)->default(0); // remaining
            $table->decimal('initial_quantity', 12, 3)->default(0);
            $table->decimal('cost_price', 12, 2)->nullable();
            $table->foreignId('purchase_item_id')->nullable()->constrained('purchase_items')->nullOnDelete();
            $table->timestamps();

            $table->index(['variant_id', 'expiry_date']);
        });

        Schema::create('sale_item_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_item_id')->constrained('sale_items')->cascadeOnDelete();
            $table->foreignId('batch_id')->constrained('product_batches')->cascadeOnDelete();
            $table->decimal('quantity', 12, 3);
            $table->decimal('quantity_returned', 12, 3)->default(0);
            $table->timestamps();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->string('order_type', 20)->nullable()->after('status'); // dine_in | takeaway | delivery
            $table->string('table_no', 20)->nullable()->after('order_type');
        });
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $t) => $t->dropColumn(['order_type', 'table_no']));
        Schema::dropIfExists('sale_item_batches');
        Schema::dropIfExists('product_batches');
        Schema::dropIfExists('product_serials');
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn(['track_serial', 'track_expiry', 'warranty_months']));
    }
};
