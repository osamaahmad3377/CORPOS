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
            $table->decimal('refunded_amount', 12, 2)->default(0)->after('paid_amount');
        });

        // Backfill from existing returns so historical revenue reporting is
        // correct too, not just returns processed after this migration.
        DB::statement('
            UPDATE sales
            SET refunded_amount = (
                SELECT COALESCE(SUM(sale_returns.total_refund), 0)
                FROM sale_returns
                WHERE sale_returns.sale_id = sales.id
            )
        ');
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('refunded_amount');
        });
    }
};
