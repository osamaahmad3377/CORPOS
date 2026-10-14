<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Items deleted before this update kept their barcodes, so the same number
// could not be used for a new item. Give those barcodes back
// (barcode -> DEL-<id>-<barcode>, saved barcode records removed).
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('product_variants')->whereNotNull('deleted_at')->pluck('id');
        if ($ids->isEmpty()) {
            return;
        }
        DB::table('barcodes')->whereIn('variant_id', $ids)->delete();
        DB::table('product_variants')->whereIn('id', $ids)->where('barcode', 'not like', 'DEL-%')
            ->update(['barcode' => DB::raw("'DEL-' || id || '-' || barcode")]);
    }

    public function down(): void
    {
        // the old numbers may be in use by new items now — nothing to undo
    }
};
