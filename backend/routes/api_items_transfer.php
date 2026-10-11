<?php

use App\Http\Controllers\Api\ItemTransferController;
use Illuminate\Support\Facades\Route;

// Items import / export (CSV and Excel are handled in the app).
Route::middleware('permission:products.view')->get('items/export', [ItemTransferController::class, 'export']);
Route::middleware('permission:products.create')->post('items/import', [ItemTransferController::class, 'import']);
