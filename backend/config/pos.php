<?php

return [

    // Sanctum tokens don't expire on a fixed TTL by default; we enforce an
    // idle timeout ourselves (see App\Http\Middleware\EnsureTokenNotExpired)
    // by checking personal_access_tokens.last_used_at against this value.
    'token_idle_minutes' => (int) env('SANCTUM_TOKEN_IDLE_MINUTES', 480),

    'login_lockout_max_attempts' => (int) env('AUTH_LOCKOUT_MAX_ATTEMPTS', 5),

    'login_lockout_minutes' => (int) env('AUTH_LOCKOUT_MINUTES', 15),

    // Staff without `sales.view_all` (i.e. plain cashiers) can discount a
    // sale on their own authority only up to this percentage of its
    // pre-discount value — combining both per-item and sale-level discount.
    // Anything beyond that needs a manager/admin (who has `sales.view_all`).
    'max_discount_percent_for_cashier' => (int) env('MAX_DISCOUNT_PERCENT_FOR_CASHIER', 20),

];
