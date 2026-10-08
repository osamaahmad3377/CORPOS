<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cash drawer: one "session" per cashier per working day (open the day →
 * close the day / Z-report). A user can have only one open session at a time
 * (enforced in CashController). The closing summary is frozen in `summary`
 * so a printed Z-report never changes after the day is closed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('cash_sessions')) {
            return;
        }

        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('opened_at');
            $table->decimal('opening_cash', 12, 2)->default(0);
            $table->dateTime('closed_at')->nullable();
            $table->decimal('counted_cash', 12, 2)->nullable();
            $table->decimal('expected_cash', 12, 2)->nullable();
            $table->decimal('difference', 12, 2)->nullable();
            $table->text('opening_note')->nullable();
            $table->text('closing_note')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('summary')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'closed_at']);
            $table->index('opened_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_sessions');
    }
};
