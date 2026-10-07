<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Product images and other files on the "public" disk. The desktop build
// runs on Windows without admin rights, so we can't rely on the usual
// public/storage symlink — serve the files through Laravel instead.
Route::get('/storage/{path}', function (string $path) {
    $disk = Storage::disk('public');

    abort_if(str_contains($path, '..') || ! $disk->exists($path), 404);

    return response()->file($disk->path($path), [
        'Cache-Control' => 'public, max-age=604800',
    ]);
})->where('path', '.*');

// Everything else that isn't an API call or a real file in public/ is a
// React Router route — hand back the single-page app shell.
Route::fallback(function () {
    $index = public_path('index.html');

    abort_unless(request()->isMethod('GET') && ! request()->is('api/*') && is_file($index), 404);

    return response()->file($index, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache',
        'X-Spa-Shell' => '1',
    ]);
});
