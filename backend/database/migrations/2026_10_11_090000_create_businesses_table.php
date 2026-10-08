<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// List of businesses run from this computer (e.g. a mart and a restaurant).
// Only the first ("home") database's copy is used: business #1 is that
// database itself, every other business lives in its own SQLite file, so
// its items, bills, customers, settings and logo never mix with the others.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('businesses', function (Blueprint $table) {
            $table->id();
            $table->string('file')->nullable()->unique(); // null = the home database
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('businesses');
    }
};
