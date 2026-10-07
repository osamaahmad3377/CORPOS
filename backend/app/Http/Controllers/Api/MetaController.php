<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;

/**
 * Static lists the frontend builds its forms from (units, payment methods,
 * business types), so they live in one place: config/pos.php.
 */
class MetaController extends Controller
{
    public function index()
    {
        $units = collect(config('pos.units'))
            ->map(fn ($u, $code) => ['code' => $code, 'label' => $u['label'], 'fractional' => $u['fractional']])
            ->values();

        $payments = collect(config('pos.payment_methods'))
            ->map(fn ($label, $code) => ['code' => $code, 'label' => $label])
            ->values();

        $types = collect(config('pos.business_types'))
            ->map(fn ($t, $code) => ['code' => $code, 'label' => $t['label'], 'unit' => $t['unit'], 'options' => $t['options'], 'features' => $t['features'] ?? []])
            ->values();

        return response()->json([
            'units' => $units,
            'payment_methods' => $payments,
            'business_types' => $types,
            'features' => config('pos.features'),
            'max_discount_percent_for_cashier' => config('pos.max_discount_percent_for_cashier'),
        ]);
    }
}
