<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Restaurant waiters (no login needed) and which waiter took each order.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waiters', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('waiter_id')->nullable()->after('table_no')->constrained('waiters')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $t) => $t->dropConstrainedForeignId('waiter_id'));
        Schema::dropIfExists('waiters');
    }
};
