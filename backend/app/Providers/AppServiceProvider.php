<?php

namespace App\Providers;

use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleReturn;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Relation::morphMap([
            'purchase' => Purchase::class,
            'sale' => Sale::class,
            'sale_return' => SaleReturn::class,
        ]);
    }
}
