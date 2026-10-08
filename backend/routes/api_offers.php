<?php

use App\Http\Controllers\Api\PromotionController;
use App\Http\Controllers\Api\SaleController;
use Illuminate\Support\Facades\Route;

// Offers (promotions) + exact price preview for the POS.
Route::middleware('permission:sales.create')->group(function () {
    Route::post('sales/preview', [SaleController::class, 'preview']);
    Route::get('promotions/active', [PromotionController::class, 'active']);
});

Route::middleware('permission:promotions.manage')->group(function () {
    Route::get('promotions', [PromotionController::class, 'index']);
    Route::post('promotions', [PromotionController::class, 'store']);
    Route::get('promotions/{promotion}', [PromotionController::class, 'show'])->whereNumber('promotion');
    Route::put('promotions/{promotion}', [PromotionController::class, 'update'])->whereNumber('promotion');
    Route::patch('promotions/{promotion}', [PromotionController::class, 'update'])->whereNumber('promotion');
    Route::delete('promotions/{promotion}', [PromotionController::class, 'destroy'])->whereNumber('promotion');
});
