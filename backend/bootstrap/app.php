<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\EnsureTokenNotExpired;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\SelectBusiness;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'token.active' => EnsureTokenNotExpired::class,
            'permission' => CheckPermission::class,
        ]);

        $middleware->append(SecurityHeaders::class);
        $middleware->prepend(SelectBusiness::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();

// The desktop app keeps Laravel's cache files in the user's data folder and
// passes their full paths (APP_*_CACHE). Laravel only treats paths starting
// with "/" or "\" as absolute, so on Windows "C:\Users\..." was glued onto
// the app folder ("C:\CorePOS\...\C:\Users\...") and PHP could not start.
// Drive letters count as absolute too.
foreach (range('A', 'Z') as $drive) {
    $app->addAbsoluteCachePathPrefix($drive.':');
    $app->addAbsoluteCachePathPrefix(strtolower($drive).':');
}

return $app;
