<?php

use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\RiderController;
use Illuminate\Support\Facades\Route;

// Restaurant deliveries and riders: the counter runs deliveries; managers edit riders.
Route::middleware('permission:sales.create')->group(function () {
    Route::get('deliveries', [DeliveryController::class, 'index']);
    Route::get('deliveries/lookup', [DeliveryController::class, 'lookup']);
    Route::post('deliveries/{sale}/send', [DeliveryController::class, 'send']);
    Route::post('deliveries/{sale}/delivered', [DeliveryController::class, 'delivered']);
    Route::post('deliveries/{sale}/returned', [DeliveryController::class, 'returned']);
    Route::get('riders', [RiderController::class, 'index']);
    Route::post('riders/{rider}/settle', [DeliveryController::class, 'settle'])->whereNumber('rider');
});
Route::middleware('permission:users.manage')->group(function () {
    Route::post('riders', [RiderController::class, 'store']);
    Route::put('riders/{rider}', [RiderController::class, 'update'])->whereNumber('rider');
    Route::delete('riders/{rider}', [RiderController::class, 'destroy'])->whereNumber('rider');
});
