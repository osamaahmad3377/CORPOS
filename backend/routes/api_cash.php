<?php

// Cash drawer & day closing (Z-report). Loaded inside the authenticated
// /api/v1 group by routes/api.php.

use App\Http\Controllers\Api\CashController;
use Illuminate\Support\Facades\Route;

// Any signed-in user: the POS asks this to warn "Drawer not opened".
Route::get('cash/current', [CashController::class, 'current']);

Route::middleware('permission:cash.manage')->group(function () {
    Route::post('cash/open', [CashController::class, 'open']);
    Route::post('cash/movements', [CashController::class, 'movement']);
    Route::post('cash/close', [CashController::class, 'close']);
});

// Own sessions with cash.manage, everyone's with cash.view_all (checked in the controller).
Route::get('cash/sessions', [CashController::class, 'index']);
Route::get('cash/sessions/{cashSession}', [CashController::class, 'show'])->whereNumber('cashSession');
Route::middleware('permission:cash.view_all')
    ->post('cash/sessions/{cashSession}/close', [CashController::class, 'closeOther'])->whereNumber('cashSession');
