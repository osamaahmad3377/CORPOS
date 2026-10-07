<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->string('idempotency_key', 64)->nullable()->unique()->after('invoice_number');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->string('idempotency_key', 64)->nullable()->unique()->after('po_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('idempotency_key');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn('idempotency_key');
        });
    }
};
