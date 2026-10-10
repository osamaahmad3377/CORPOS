<?php

use App\Http\Controllers\Api\WaiterController;
use Illuminate\Support\Facades\Route;

// Restaurant waiters: anyone taking orders can see the list; managers edit it.
Route::middleware('permission:sales.create')->get('waiters', [WaiterController::class, 'index']);
Route::middleware('permission:users.manage')->group(function () {
    Route::post('waiters', [WaiterController::class, 'store']);
    Route::put('waiters/{waiter}', [WaiterController::class, 'update'])->whereNumber('waiter');
    Route::delete('waiters/{waiter}', [WaiterController::class, 'destroy'])->whereNumber('waiter');
});
