<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTokenNotExpired
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        // A deactivated account (fired staff, suspended for fraud, etc.)
        // must lose access immediately — not just at their next login.
        // Without this, an already-issued token keeps working until it
        // idles out on its own, regardless of is_active.
        if ($user && ! $user->is_active) {
            $token?->delete();
            abort(401, 'This account has been deactivated.');
        }

        $lastUsedAt = $token->last_used_at ?? null;

        if ($token && $lastUsedAt && $lastUsedAt->diffInMinutes(now()) > config('pos.token_idle_minutes')) {
            $token->delete();
            abort(401, 'Session expired due to inactivity.');
        }

        return $next($request);
    }
}
