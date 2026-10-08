<?php

use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\ReportController;
use Illuminate\Support\Facades\Route;

// Expenses (shop running costs) — loaded inside the signed-in group of routes/api.php.
Route::middleware('permission:expenses.manage')->group(function () {
    Route::get('expenses/categories', [ExpenseController::class, 'categories']);
    Route::get('expenses', [ExpenseController::class, 'index']);
    Route::post('expenses', [ExpenseController::class, 'store']);
    Route::get('expenses/{expense}', [ExpenseController::class, 'show'])->whereNumber('expense');
    Route::put('expenses/{expense}', [ExpenseController::class, 'update'])->whereNumber('expense');
    Route::patch('expenses/{expense}', [ExpenseController::class, 'update'])->whereNumber('expense');
    Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy'])->whereNumber('expense');
});

// Profit & expenses report: sales − cost of goods − expenses = net profit.
Route::middleware('permission:reports.view')->get('reports/profit', [ReportController::class, 'profit']);
