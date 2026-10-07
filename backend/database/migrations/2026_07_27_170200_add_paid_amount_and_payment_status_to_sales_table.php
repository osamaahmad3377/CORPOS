<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('paid_amount', 12, 2)->default(0)->after('change_amount');
            $table->enum('payment_status', ['paid', 'partial', 'pending'])->default('paid')->after('status');
        });

        DB::table('sales')->where('status', '!=', 'held')->update([
            'paid_amount' => DB::raw('CASE WHEN payment_received < grand_total THEN payment_received ELSE grand_total END'),
        ]);

        DB::table('sales')->whereColumn('paid_amount', '>=', 'grand_total')->update(['payment_status' => 'paid']);
        DB::table('sales')->whereColumn('paid_amount', '<', 'grand_total')->where('paid_amount', '>', 0)->update(['payment_status' => 'partial']);
        DB::table('sales')->where('paid_amount', '<=', 0)->update(['payment_status' => 'pending']);
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['paid_amount', 'payment_status']);
        });
    }
};
