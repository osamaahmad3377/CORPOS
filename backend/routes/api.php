<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BarcodeController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\MetaController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductVariantController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\PurchaseReturnController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SaleReturnController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::get('/businesses/list', [\App\Http\Controllers\Api\BusinessController::class, 'publicList']);

Route::middleware(['auth:sanctum', 'token.active'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/meta', [MetaController::class, 'index']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);

    Route::apiResource('categories', CategoryController::class)
        ->except(['store', 'update', 'destroy']);
    Route::middleware('permission:categories.manage')->group(function () {
        Route::post('categories', [CategoryController::class, 'store']);
        Route::put('categories/{category}', [CategoryController::class, 'update']);
        Route::patch('categories/{category}', [CategoryController::class, 'update']);
        Route::delete('categories/{category}', [CategoryController::class, 'destroy']);
    });

    Route::apiResource('brands', BrandController::class)
        ->except(['store', 'update', 'destroy']);
    Route::middleware('permission:brands.manage')->group(function () {
        Route::post('brands', [BrandController::class, 'store']);
        Route::put('brands/{brand}', [BrandController::class, 'update']);
        Route::patch('brands/{brand}', [BrandController::class, 'update']);
        Route::delete('brands/{brand}', [BrandController::class, 'destroy']);
    });

    Route::middleware('permission:suppliers.manage')->group(function () {
        Route::apiResource('suppliers', SupplierController::class);
    });

    Route::middleware('permission:customers.view')->group(function () {
        Route::get('customers', [CustomerController::class, 'index']);
        Route::get('customers/{customer}', [CustomerController::class, 'show']);
    });
    Route::middleware('permission:customers.create')->post('customers', [CustomerController::class, 'store']);
    Route::middleware('permission:customers.edit')->group(function () {
        Route::put('customers/{customer}', [CustomerController::class, 'update']);
        Route::patch('customers/{customer}', [CustomerController::class, 'update']);
    });
    Route::middleware('permission:customers.delete')->delete('customers/{customer}', [CustomerController::class, 'destroy']);

    // Every authenticated role needs to read shop/tax/receipt config to run
    // POS and print receipts correctly — only editing is Admin-only.
    Route::get('settings', [SettingController::class, 'index']);
    Route::middleware('permission:settings.manage')->group(function () {
        Route::put('settings', [SettingController::class, 'update']);
        Route::post('settings/logo', [SettingController::class, 'uploadLogo']);
        Route::post('settings/business-type', [SettingController::class, 'applyBusinessType']);
        Route::delete('settings/logo', [SettingController::class, 'removeLogo']);
    });

    Route::middleware('permission:users.manage')->group(function () {
        Route::get('roles', [RoleController::class, 'index']);
        Route::apiResource('users', UserController::class)->except(['destroy']);
        Route::delete('users/{user}', [UserController::class, 'destroy']);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);
    });

    Route::middleware('permission:products.view')->group(function () {
        Route::get('products', [ProductController::class, 'index']);
        Route::get('products/{product}', [ProductController::class, 'show']);
        Route::get('product-variants/search', [ProductVariantController::class, 'search']);
        Route::get('product-variants/{variant}/serials', [TrackingController::class, 'variantSerials']);
        Route::get('product-variants/{variant}/batches', [TrackingController::class, 'variantBatches']);
        Route::get('serials/{serial}', [TrackingController::class, 'serial']);
    });
    Route::middleware('permission:products.create')->post('products', [ProductController::class, 'store']);
    Route::middleware('permission:products.edit')->group(function () {
        Route::put('products/{product}', [ProductController::class, 'update']);
        Route::patch('products/{product}', [ProductController::class, 'update']);
        Route::post('products/{product}/variants', [ProductVariantController::class, 'storeForProduct']);
        Route::post('products/{product}/image', [ProductController::class, 'updateImage']);
        Route::put('product-variants/{variant}', [ProductVariantController::class, 'update']);
        Route::patch('product-variants/{variant}', [ProductVariantController::class, 'update']);
    });
    Route::middleware('permission:products.delete')->group(function () {
        Route::delete('products/{product}', [ProductController::class, 'destroy']);
        Route::delete('product-variants/{variant}', [ProductVariantController::class, 'destroy']);
    });

    Route::middleware('permission:barcodes.scan')->get('barcodes/scan/{code}', [BarcodeController::class, 'scan']);
    Route::middleware('permission:barcodes.manage')->group(function () {
        Route::get('barcodes/check/{code}', [BarcodeController::class, 'check']);
        Route::post('product-variants/{variant}/barcode/generate', [BarcodeController::class, 'generate']);
        Route::post('product-variants/{variant}/barcode/assign', [BarcodeController::class, 'assign']);
        Route::post('barcodes/print', [BarcodeController::class, 'print']);
    });

    Route::middleware('permission:sales.create')->group(function () {
        Route::get('sales', [SaleController::class, 'index']);
        Route::get('sales/{sale}', [SaleController::class, 'show']);
        Route::post('sales', [SaleController::class, 'store']);
        Route::post('sales/{sale}/resume', [SaleController::class, 'resume']);
        Route::post('sales/{sale}/payments', [SaleController::class, 'recordPayment']);
        Route::delete('sales/{sale}', [SaleController::class, 'destroy']);
    });
    Route::middleware('permission:sales.return')->post('sales/{sale}/returns', [SaleReturnController::class, 'store']);

    Route::middleware('permission:purchases.view')->group(function () {
        Route::get('purchases', [PurchaseController::class, 'index']);
        Route::get('purchases/{purchase}', [PurchaseController::class, 'show']);
    });
    Route::middleware('permission:purchases.manage')->group(function () {
        Route::post('purchases', [PurchaseController::class, 'store']);
        Route::post('purchases/{purchase}/payments', [PurchaseController::class, 'recordPayment']);
    });
    Route::middleware('permission:purchases.return')->post('purchases/{purchase}/returns', [PurchaseReturnController::class, 'store']);

    Route::middleware('permission:inventory.view')->group(function () {
        Route::get('inventory', [InventoryController::class, 'index']);
        Route::get('inventory/adjustments', [InventoryController::class, 'adjustments']);
    });
    Route::middleware('permission:inventory.adjust')->post('inventory/adjust', [InventoryController::class, 'adjust']);

    Route::prefix('dashboard')->group(function () {
        Route::get('stats', [DashboardController::class, 'stats']);
        Route::get('sales-chart', [DashboardController::class, 'salesChart']);
        Route::get('top-products', [DashboardController::class, 'topProducts']);
        Route::get('low-stock', [DashboardController::class, 'lowStock']);
        Route::get('recent-sales', [DashboardController::class, 'recentSales']);
    });

    Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
        Route::get('daily-sales', [ReportController::class, 'dailySales']);
        Route::get('monthly-sales', [ReportController::class, 'monthlySales']);
        Route::get('product-sales', [ReportController::class, 'productSales']);
        Route::get('inventory', [ReportController::class, 'inventory']);
        Route::get('low-stock', [ReportController::class, 'lowStock']);
        Route::get('expiring', [TrackingController::class, 'expiring']);
        Route::get('purchases', [ReportController::class, 'purchases']);
        Route::get('customers', [ReportController::class, 'customers']);
    });

    Route::middleware('permission:activity_logs.view')->get('activity-logs', [ActivityLogController::class, 'index']);

    // Feature modules keep their routes in routes/api_<feature>.php
    // (cash drawer, expenses, quotations, offers…), all behind sign-in.
    foreach (glob(__DIR__.'/api_*.php') as $featureRoutes) {
        require $featureRoutes;
    }
});
