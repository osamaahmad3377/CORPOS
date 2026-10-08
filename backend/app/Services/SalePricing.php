<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Promotion;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Works out every price on a sale on the server — the single source of truth
 * for POST /sales and POST /sales/preview:
 *   1. unit price from the catalog at the sale's price level (retail / wholesale)
 *   2. the cashier's own line discount (discount_per_item)
 *   3. the best running offer for each line (promo_discount, promotion_id)
 *   4. the sale-level discount + loyalty points used
 *   5. the cashier discount cap (offers and points don't count towards it)
 *
 * With no offers, no points and retail prices the result is exactly what
 * SaleController computed before this class existed.
 */
class SalePricing
{
    /**
     * @param  array  $data  validated StoreSaleRequest data
     * @param  Collection  $variants  ProductVariant models keyed by id
     * @param  float|null  $taxAmount  null = use $data['tax_amount'] (default 0)
     */
    public static function compute(array $data, Collection $variants, ?Customer $customer, User $user, ?float $taxAmount = null): array
    {
        $level = self::priceLevel($data, $customer);
        $promotions = Promotion::running()->orderBy('id')->get();
        $categoryChains = $promotions->contains('applies_to', 'category') ? self::categoryChains() : [];
        if ($promotions->isNotEmpty()) {
            $variants->loadMissing('product');
        }

        $lines = [];
        $rawSubtotal = 0;
        $subtotal = 0;
        $promoTotal = 0;
        $manualLineTotal = 0;

        foreach ($data['items'] as $i => $item) {
            $variant = $variants[$item['variant_id']];
            $qty = (float) $item['quantity'];
            $unitPrice = self::unitPrice($variant, $level);
            $manual = (float) ($item['discount_per_item'] ?? 0);
            $gross = $unitPrice * $qty;

            if ($gross - $manual < 0) {
                throw ValidationException::withMessages([
                    'items' => ["Discount for variant #{$item['variant_id']} cannot exceed its line total."],
                ]);
            }

            $promo = null;
            $promoDiscount = 0;
            foreach ($promotions as $p) {
                if (! self::matches($p, $variant, $categoryChains)) {
                    continue;
                }
                $amount = self::offerAmount($p, $unitPrice, $qty);
                if ($amount > $promoDiscount + 0.0001) {
                    $promo = $p;
                    $promoDiscount = $amount;
                }
            }
            // An offer never pushes a line below zero after the cashier's own discount.
            $promoDiscount = round(min($promoDiscount, max(0, $gross - $manual)), 2);
            if ($promoDiscount <= 0) {
                $promo = null;
                $promoDiscount = 0;
            }

            $lineTotal = $gross - $manual - $promoDiscount;
            $rawSubtotal += $gross;
            $subtotal += $lineTotal;
            $promoTotal += $promoDiscount;
            $manualLineTotal += $manual;

            $lines[$i] = [
                'variant_id' => (int) $item['variant_id'],
                'quantity' => $qty,
                'unit_price' => $unitPrice,
                'retail_price' => (float) $variant->selling_price,
                'line_subtotal' => $gross,
                'manual_discount' => $manual,
                'promo_discount' => $promoDiscount,
                'promotion_id' => $promo?->id,
                'promotion_name' => $promo?->name,
                'discount_per_item' => $manual + $promoDiscount,
                'total_price' => $lineTotal,
            ];
        }

        $saleDiscount = (float) ($data['discount_amount'] ?? 0);
        $tax = $taxAmount ?? (float) ($data['tax_amount'] ?? 0);

        if ($subtotal - $saleDiscount + $tax < 0) {
            throw ValidationException::withMessages([
                'discount_amount' => ['Discount cannot exceed the sale subtotal plus tax.'],
            ]);
        }

        // Loyalty points used as money off the bill.
        $loyalty = self::loyalty();
        $points = (int) ($data['points_redeemed'] ?? 0);
        $pointsDiscount = 0;
        if ($points > 0) {
            if (! $loyalty['enabled']) {
                throw ValidationException::withMessages(['points_redeemed' => ['Loyalty points are switched off.']]);
            }
            if (! $customer) {
                throw ValidationException::withMessages(['points_redeemed' => ['Choose the customer to use their points.']]);
            }
            if ($loyalty['point_value'] <= 0) {
                throw ValidationException::withMessages(['points_redeemed' => ['Set how much 1 point is worth first (Offers & loyalty).']]);
            }
            if ($points < $loyalty['min_redeem']) {
                throw ValidationException::withMessages(['points_redeemed' => ['Fewer points than the minimum that can be used (see Offers & loyalty).']]);
            }
            if ((int) $customer->loyalty_points < $points) {
                throw ValidationException::withMessages(['points_redeemed' => ['The customer does not have that many points.']]);
            }
            $pointsDiscount = round($points * $loyalty['point_value'], 2);
            if ($subtotal - $saleDiscount - $pointsDiscount + $tax < -0.001) {
                throw ValidationException::withMessages(['points_redeemed' => ['These points are worth more than the bill. Use fewer points.']]);
            }
        }

        $discountAmount = $saleDiscount + $pointsDiscount;
        $grandTotal = $subtotal - $discountAmount + $tax;

        // A plain cashier can discount on their own authority only up to a
        // capped percentage of the pre-discount value — larger discounts need
        // someone with sales.view_all (manager/admin). Automatic offers and
        // points the customer earned are not the cashier's discount.
        if (! $user->hasPermission('sales.view_all') && $rawSubtotal > 0) {
            $maxPercent = config('pos.max_discount_percent_for_cashier');
            $cashierDiscount = $manualLineTotal + $saleDiscount;

            if ($cashierDiscount > $rawSubtotal * $maxPercent / 100) {
                throw ValidationException::withMessages([
                    'discount_amount' => ["Total discount exceeds the {$maxPercent}% limit you're authorized for. Ask a manager to apply a larger discount."],
                ]);
            }
        }

        return [
            'price_level' => $level,
            'lines' => $lines,
            'raw_subtotal' => $rawSubtotal,
            'line_discount' => $manualLineTotal,
            'promo_discount' => $promoTotal,
            'subtotal' => $subtotal,
            'sale_discount' => $saleDiscount,
            'points_redeemed' => $points,
            'points_discount' => $pointsDiscount,
            'discount_amount' => $discountAmount,
            'tax_amount' => $tax,
            'grand_total' => $grandTotal,
            'points_earned' => $customer ? self::pointsFor($grandTotal, $loyalty) : 0,
            'loyalty' => $loyalty,
        ];
    }

    /** Requested level, else the customer's level, else retail. */
    public static function priceLevel(array $data, ?Customer $customer): string
    {
        $level = $data['price_level'] ?? ($customer?->price_level ?: 'retail');

        return $level === 'wholesale' ? 'wholesale' : 'retail';
    }

    public static function unitPrice($variant, string $level): float
    {
        if ($level === 'wholesale' && $variant->wholesale_price !== null) {
            return (float) $variant->wholesale_price;
        }

        return (float) $variant->selling_price;
    }

    /** Money off one line for one offer (not yet capped). */
    public static function offerAmount(Promotion $p, float $unitPrice, float $qty): float
    {
        $value = (float) $p->value;

        return match ($p->type) {
            'percent' => round($unitPrice * $qty * min(100, max(0, $value)) / 100, 2),
            // Rs off each unit (each kg / litre for loose items)
            'fixed' => round(min(max(0, $value), $unitPrice) * $qty, 2),
            'buy_x_get_y' => ($p->buy_qty > 0 && $p->get_qty > 0)
                ? round(floor(round($qty, 3) / ($p->buy_qty + $p->get_qty)) * $p->get_qty * $unitPrice, 2)
                : 0,
            default => 0,
        };
    }

    private static function matches(Promotion $p, $variant, array $categoryChains): bool
    {
        return match ($p->applies_to) {
            'all' => true,
            'product' => $p->product_id && (int) $variant->product_id === (int) $p->product_id,
            'category' => $p->category_id && in_array((int) $p->category_id, $categoryChains[(int) $variant->product?->category_id] ?? [], true),
            default => false,
        };
    }

    /** category id => [itself, parent, grand-parent, …] so an offer on a category covers its sub-categories. */
    private static function categoryChains(): array
    {
        $parents = Category::withTrashed()->pluck('parent_id', 'id')->all();
        $chains = [];
        foreach ($parents as $id => $_) {
            $chain = [];
            $cur = $id;
            while ($cur && ! in_array((int) $cur, $chain, true) && count($chain) < 20) {
                $chain[] = (int) $cur;
                $cur = $parents[$cur] ?? null;
            }
            $chains[$id] = $chain;
        }

        return $chains;
    }

    /** Settings group `loyalty` as typed values. */
    public static function loyalty(): array
    {
        $s = Setting::group('loyalty');

        return [
            'enabled' => ($s['loyalty.enabled'] ?? '0') === '1',
            'points_per_100' => (float) ($s['loyalty.points_per_100'] ?? 0),
            'point_value' => (float) ($s['loyalty.point_value'] ?? 0),
            'min_redeem' => (int) ($s['loyalty.min_redeem'] ?? 0),
        ];
    }

    /** Points earned on a bill of $total (0 when loyalty is off). */
    public static function pointsFor(float $total, ?array $loyalty = null): int
    {
        $loyalty ??= self::loyalty();
        if (! $loyalty['enabled'] || $loyalty['points_per_100'] <= 0 || $total <= 0) {
            return 0;
        }

        return (int) floor(round($total / 100 * $loyalty['points_per_100'], 6));
    }
}
