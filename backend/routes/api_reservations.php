<?php

use App\Http\Controllers\Api\ReservationController;
use Illuminate\Support\Facades\Route;

// Table reservations: anyone at the counter can book, seat and cancel.
Route::middleware('permission:sales.create')->group(function () {
    Route::get('reservations', [ReservationController::class, 'index']);
    Route::get('reservations/today', [ReservationController::class, 'today']);
    Route::post('reservations', [ReservationController::class, 'store']);
    Route::put('reservations/{reservation}', [ReservationController::class, 'update'])->whereNumber('reservation');
    Route::post('reservations/{reservation}/status', [ReservationController::class, 'status'])->whereNumber('reservation');
    Route::delete('reservations/{reservation}', [ReservationController::class, 'destroy'])->whereNumber('reservation');
});
