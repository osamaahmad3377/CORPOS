<?php

use App\Http\Controllers\Api\QuotationController;
use Illuminate\Support\Facades\Route;

// Quotations / estimates (no stock or money moves). Loaded inside the
// signed-in group of routes/api.php.
Route::middleware('permission:quotations.manage')->group(function () {
    Route::get('quotations', [QuotationController::class, 'index']);
    Route::post('quotations', [QuotationController::class, 'store']);
    Route::get('quotations/{quotation}', [QuotationController::class, 'show'])->whereNumber('quotation');
    Route::put('quotations/{quotation}', [QuotationController::class, 'update'])->whereNumber('quotation');
    Route::patch('quotations/{quotation}', [QuotationController::class, 'update'])->whereNumber('quotation');
    Route::delete('quotations/{quotation}', [QuotationController::class, 'destroy'])->whereNumber('quotation');
    Route::post('quotations/{quotation}/mark-converted', [QuotationController::class, 'markConverted'])->whereNumber('quotation');
});
