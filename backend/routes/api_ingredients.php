<?php

use App\Http\Controllers\Api\IngredientController;
use Illuminate\Support\Facades\Route;

// Kitchen stock (restaurant raw materials) and dish recipes.
Route::get('ingredients/alerts', [IngredientController::class, 'alerts']);
Route::middleware('permission:inventory.view')->group(function () {
    Route::get('ingredients', [IngredientController::class, 'index']);
    Route::get('ingredients/{ingredient}/movements', [IngredientController::class, 'movements'])->whereNumber('ingredient');
    Route::get('product-variants/{variant}/recipe', [IngredientController::class, 'recipe'])->whereNumber('variant');
});
Route::middleware('permission:inventory.adjust')->group(function () {
    Route::post('ingredients', [IngredientController::class, 'store']);
    Route::put('ingredients/{ingredient}', [IngredientController::class, 'update'])->whereNumber('ingredient');
    Route::delete('ingredients/{ingredient}', [IngredientController::class, 'destroy'])->whereNumber('ingredient');
    Route::post('ingredients/{ingredient}/adjust', [IngredientController::class, 'adjust'])->whereNumber('ingredient');
});
Route::middleware('permission:products.edit')->group(function () {
    Route::put('product-variants/{variant}/recipe', [IngredientController::class, 'saveRecipe'])->whereNumber('variant');
});
