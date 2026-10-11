<?php

use App\Http\Controllers\Api\TableActionController;
use Illuminate\Support\Facades\Route;

// Restaurant table actions on open orders.
Route::middleware('permission:sales.create')->group(function () {
    Route::post('sales/{sale}/move', [TableActionController::class, 'move']);
    Route::post('sales/{sale}/merge', [TableActionController::class, 'merge']);
    Route::post('sales/{sale}/split', [TableActionController::class, 'split']);
});
