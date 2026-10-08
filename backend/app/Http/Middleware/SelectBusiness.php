<?php

namespace App\Http\Middleware;

use App\Support\Businesses;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Picks the business (mart, restaurant, …) a request works on from the
 * X-Business header. Runs before authentication, so a login token is only
 * ever looked up in the business it was issued by.
 */
class SelectBusiness
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = (int) $request->header('X-Business', Businesses::HOME);
        if ($id > 0 && $id !== Businesses::HOME && $request->is('api/*')) {
            Businesses::use($id);
        }

        return $next($request);
    }
}
