<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Restaurant delivery (riders, the customer's address, delivery charge and
// where the order is: pending -> out -> delivered) and table reservations.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('riders', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('rider_id')->nullable()->after('waiter_id')->constrained('riders')->nullOnDelete();
            $table->decimal('delivery_fee', 10, 2)->default(0)->after('tax_amount');
            $table->string('delivery_name', 80)->nullable()->after('rider_id');
            $table->string('delivery_phone', 30)->nullable()->after('delivery_name');
            $table->string('delivery_address', 255)->nullable()->after('delivery_phone');
            $table->string('delivery_area', 80)->nullable()->after('delivery_address');
            $table->string('delivery_status', 20)->nullable()->after('delivery_area'); // pending | out | delivered
            $table->timestamp('dispatched_at')->nullable()->after('delivery_status');
            $table->timestamp('delivered_at')->nullable()->after('dispatched_at');
            $table->index('delivery_phone');
            $table->index('delivery_status');
        });

        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('phone', 30)->nullable();
            $table->unsignedSmallInteger('guests')->default(2);
            $table->dateTime('reserved_for');
            $table->unsignedSmallInteger('duration_minutes')->default(90);
            $table->string('table_no', 20)->nullable();
            $table->string('status', 20)->default('booked'); // booked | seated | done | cancelled | no_show
            $table->text('notes')->nullable();
            $table->timestamp('seated_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['reserved_for', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservations');
        Schema::table('sales', function (Blueprint $t) {
            $t->dropIndex(['delivery_phone']);
            $t->dropIndex(['delivery_status']);
            $t->dropConstrainedForeignId('rider_id');
            $t->dropColumn(['delivery_fee', 'delivery_name', 'delivery_phone', 'delivery_address', 'delivery_area', 'delivery_status', 'dispatched_at', 'delivered_at']);
        });
        Schema::dropIfExists('riders');
    }
};
