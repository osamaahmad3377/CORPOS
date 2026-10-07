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

    // Units a product can be sold in. `fractional` units accept quantities
    // like 1.5 (kg of rice, metres of cable); the rest must be whole numbers.
    'units' => [
        'pcs' => ['label' => 'Piece', 'fractional' => false],
        'pair' => ['label' => 'Pair', 'fractional' => false],
        'dozen' => ['label' => 'Dozen', 'fractional' => true],
        'box' => ['label' => 'Box', 'fractional' => false],
        'pack' => ['label' => 'Pack', 'fractional' => false],
        'carton' => ['label' => 'Carton', 'fractional' => false],
        'plate' => ['label' => 'Plate', 'fractional' => true],
        'kg' => ['label' => 'Kilogram', 'fractional' => true],
        'g' => ['label' => 'Gram', 'fractional' => true],
        'litre' => ['label' => 'Litre', 'fractional' => true],
        'ml' => ['label' => 'Millilitre', 'fractional' => true],
        'meter' => ['label' => 'Metre', 'fractional' => true],
        'foot' => ['label' => 'Foot', 'fractional' => true],
        'yard' => ['label' => 'Yard', 'fractional' => true],
        'sqft' => ['label' => 'Square foot', 'fractional' => true],
        'hour' => ['label' => 'Hour', 'fractional' => true],
        'service' => ['label' => 'Service', 'fractional' => false],
    ],

    'payment_methods' => [
        'cash' => 'Cash',
        'card' => 'Card',
        'jazzcash' => 'JazzCash',
        'easypaisa' => 'Easypaisa',
        'bank_transfer' => 'Bank transfer',
        'cheque' => 'Cheque',
        'other' => 'Other',
    ],

    // Optional modules a shop can switch on in Settings: restaurant (order
    // types, tables, kitchen slips), serials (IMEI/serial per unit, warranty),
    // expiry (batches + expiry dates, FEFO selling, near-expiry alerts).
    'features' => ['restaurant', 'serials', 'expiry'],

    // Chosen once at setup. Seeds starter categories and names the two
    // optional per-variant options (stored in the variants' color/size
    // columns) in words that fit the trade. Everything stays editable.
    'business_types' => [
        'general' => [
            'features' => [],
            'label' => 'General store / Karyana',
            'unit' => 'pcs',
            'options' => ['Variant', 'Size'],
            'categories' => ['Grocery' => ['Rice & Flour', 'Pulses', 'Spices', 'Oil & Ghee'], 'Beverages' => [], 'Snacks' => [], 'Household' => [], 'Personal care' => []],
        ],
        'grocery' => [
            'features' => ['expiry'],
            'label' => 'Grocery / Supermarket',
            'unit' => 'pcs',
            'options' => ['Brand variant', 'Pack size'],
            'categories' => ['Staples' => ['Rice', 'Flour (Atta)', 'Pulses (Daal)', 'Sugar'], 'Cooking' => ['Oil & Ghee', 'Spices'], 'Dairy' => [], 'Beverages' => [], 'Snacks' => [], 'Fruits & Vegetables' => [], 'Household' => [], 'Personal care' => []],
        ],
        'clothing' => [
            'features' => [],
            'label' => 'Clothing / Boutique',
            'unit' => 'pcs',
            'options' => ['Color', 'Size'],
            'categories' => ['Men' => ['Shalwar Kameez', 'Shirts', 'Trousers'], 'Women' => ['Unstitched', 'Stitched', 'Dupatta'], 'Kids' => ['Boys', 'Girls'], 'Accessories' => []],
        ],
        'shoes' => [
            'features' => [],
            'label' => 'Shoes / Footwear',
            'unit' => 'pair',
            'options' => ['Color', 'Size'],
            'categories' => ['Men' => ['Formal', 'Casual', 'Sandals'], 'Women' => ['Heels', 'Flats', 'Sandals'], 'Kids' => [], 'Sports' => []],
        ],
        'electronics' => [
            'features' => ['serials'],
            'label' => 'Electronics / Mobile shop',
            'unit' => 'pcs',
            'options' => ['Color', 'Storage / Model'],
            'categories' => ['Mobile phones' => [], 'Accessories' => ['Chargers & Cables', 'Covers', 'Handsfree'], 'Home appliances' => [], 'Computers' => [], 'Repair parts' => []],
        ],
        'hardware' => [
            'features' => [],
            'label' => 'Hardware / Sanitary / Paint',
            'unit' => 'pcs',
            'options' => ['Size', 'Grade / Finish'],
            'categories' => ['Tools' => [], 'Electrical' => ['Wires & Cables', 'Switches', 'Lights'], 'Plumbing & Sanitary' => [], 'Paint' => [], 'Fasteners' => []],
        ],
        'pharmacy' => [
            'features' => ['expiry'],
            'label' => 'Pharmacy / Medical store',
            'unit' => 'pcs',
            'options' => ['Strength', 'Pack'],
            'categories' => ['Tablets & Capsules' => [], 'Syrups' => [], 'Injections' => [], 'Surgical' => [], 'Baby care' => [], 'Personal care' => []],
        ],
        'cosmetics' => [
            'features' => ['expiry'],
            'label' => 'Cosmetics / Beauty',
            'unit' => 'pcs',
            'options' => ['Shade', 'Size'],
            'categories' => ['Makeup' => [], 'Skin care' => [], 'Hair care' => [], 'Fragrance' => [], 'Jewellery' => []],
        ],
        'restaurant' => [
            'features' => ['restaurant'],
            'label' => 'Restaurant / Cafe / Bakery',
            'unit' => 'plate',
            'options' => ['Size', 'Flavour'],
            'categories' => ['Main course' => [], 'Fast food' => [], 'BBQ' => [], 'Drinks' => [], 'Desserts' => [], 'Bakery' => []],
        ],
        'auto' => [
            'features' => ['serials'],
            'label' => 'Auto parts / Car & bike dealer',
            'unit' => 'pcs',
            'options' => ['Model / Make', 'Year / Size'],
            'categories' => ['Vehicles' => ['Cars', 'Motorbikes'], 'Engine parts' => [], 'Tyres & Batteries' => [], 'Oils & Lubricants' => [], 'Accessories' => []],
        ],
        'books' => [
            'features' => [],
            'label' => 'Books / Stationery',
            'unit' => 'pcs',
            'options' => ['Edition', 'Size'],
            'categories' => ['Books' => ['School', 'Novels', 'Islamic'], 'Stationery' => [], 'Office supplies' => [], 'Art & Craft' => []],
        ],
    ],

];
