<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->decimal('paid_amount', 12, 2)->default(0)->after('grand_total');
        });

        // Existing seeded rows had a manually-set payment_status with no real
        // paid_amount — backfill so old rows are consistent with the new
        // due-amount math instead of silently reporting the full total as due.
        DB::table('purchases')->where('payment_status', 'paid')->update([
            'paid_amount' => DB::raw('grand_total'),
        ]);
        DB::table('purchases')->where('payment_status', 'partial')->update([
            'paid_amount' => DB::raw('ROUND(grand_total * 0.5, 2)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn('paid_amount');
        });
    }
};
