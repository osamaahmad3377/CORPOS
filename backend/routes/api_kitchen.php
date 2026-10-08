<?php

use App\Http\Controllers\Api\KitchenController;
use Illuminate\Support\Facades\Route;

Route::middleware('permission:sales.create')->group(function () {
    Route::get('kitchen/orders', [KitchenController::class, 'index']);
    Route::post('kitchen/orders/{sale}/status', [KitchenController::class, 'status']);
});
