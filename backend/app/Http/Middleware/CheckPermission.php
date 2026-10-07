<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    public function handle(Request $request, Closure $next, string $slug): Response
    {
        abort_unless($request->user()?->hasPermission($slug), 403, 'You do not have permission to perform this action.');

        return $next($request);
    }
}
