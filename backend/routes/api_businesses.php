<?php

use App\Http\Controllers\Api\BusinessController;
use Illuminate\Support\Facades\Route;

Route::get('businesses', [BusinessController::class, 'index']);
Route::post('businesses/{business}/switch', [BusinessController::class, 'switch'])->whereNumber('business')->middleware('throttle:30,1');
Route::middleware('permission:settings.manage')->group(function () {
    Route::post('businesses', [BusinessController::class, 'store']);
    Route::delete('businesses/{business}', [BusinessController::class, 'destroy'])->whereNumber('business');
});
