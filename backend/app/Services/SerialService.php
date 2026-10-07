<?php

namespace App\Services;

use App\Models\ProductSerial;
use App\Models\ProductVariant;
use App\Models\SaleItem;
use App\Support\Qty;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Serial / IMEI / chassis numbers for products with track_serial on.
 * Stock of such a product is always whole units, one serial per unit.
 */
class SerialService
{
    public static function tracks(ProductVariant $variant): bool
    {
        return (bool) $variant->product?->track_serial;
    }

    /** Normalise a client-supplied list: trimmed, non-empty, de-duplicated check. */
    public static function clean(?array $serials, string $field): array
    {
        $list = collect($serials ?? [])->map(fn ($s) => trim((string) $s))->filter()->values();
        $dupes = $list->duplicates();
        if ($dupes->isNotEmpty()) {
            throw ValidationException::withMessages([$field => ['Serial entered twice: '.$dupes->first()]]);
        }

        return $list->all();
    }

    private static function assertCount(ProductVariant $variant, array $serials, float $qty, string $field): void
    {
        if (count($serials) !== (int) Qty::round($qty) || ! Qty::isWhole($qty)) {
            throw ValidationException::withMessages([
                $field => ["{$variant->product->name} needs one serial/IMEI per unit: enter ".Qty::format($qty).' serial(s).'],
            ]);
        }
    }

    /** New units arriving (purchase, opening stock, stock-in adjustment). */
    public static function receive(ProductVariant $variant, array $serials, float $qty, string $field, ?int $purchaseId = null): void
    {
        if (! self::tracks($variant)) {
            return;
        }
        self::assertCount($variant, $serials, $qty, $field);

        $taken = ProductSerial::whereIn('serial', $serials)->pluck('serial');
        if ($taken->isNotEmpty()) {
            throw ValidationException::withMessages([$field => ['Serial already exists: '.$taken->implode(', ')]]);
        }

        foreach ($serials as $serial) {
            ProductSerial::create(['variant_id' => $variant->id, 'serial' => $serial, 'status' => 'in_stock', 'purchase_id' => $purchaseId]);
        }
    }

    /** Units leaving through a sale: the chosen serials must be in stock for this variant. */
    public static function sell(ProductVariant $variant, SaleItem $item, array $serials, string $field): void
    {
        if (! self::tracks($variant)) {
            return;
        }
        self::assertCount($variant, $serials, $item->quantity, $field);

        $rows = ProductSerial::where('variant_id', $variant->id)->whereIn('serial', $serials)->where('status', 'in_stock')->lockForUpdate()->get();
        $missing = collect($serials)->diff($rows->pluck('serial'));
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages([$field => ["Not in stock for {$variant->product->name}: ".$missing->implode(', ')]]);
        }

        ProductSerial::whereIn('id', $rows->pluck('id'))->update(['status' => 'sold', 'sale_item_id' => $item->id, 'sold_at' => now()]);
    }

    /** Customer return: those serials come back into stock. */
    public static function returnFromCustomer(SaleItem $item, array $serials, float $qty, string $field): void
    {
        $variant = $item->variant;
        if (! self::tracks($variant)) {
            return;
        }
        self::assertCount($variant, $serials, $qty, $field);

        $rows = ProductSerial::where('sale_item_id', $item->id)->whereIn('serial', $serials)->where('status', 'sold')->get();
        if ($rows->count() !== count($serials)) {
            throw ValidationException::withMessages([$field => ['These serials were not sold on this bill: '.collect($serials)->diff($rows->pluck('serial'))->implode(', ')]]);
        }
        ProductSerial::whereIn('id', $rows->pluck('id'))->update(['status' => 'in_stock', 'sale_item_id' => null, 'sold_at' => null]);
    }

    /** Units leaving without a sale (return to supplier, damage, count down). */
    public static function remove(ProductVariant $variant, array $serials, float $qty, string $field, string $status = 'damaged'): void
    {
        if (! self::tracks($variant)) {
            return;
        }
        self::assertCount($variant, $serials, $qty, $field);

        $rows = ProductSerial::where('variant_id', $variant->id)->whereIn('serial', $serials)->where('status', 'in_stock')->get();
        if ($rows->count() !== count($serials)) {
            throw ValidationException::withMessages([$field => ['Not in stock: '.collect($serials)->diff($rows->pluck('serial'))->implode(', ')]]);
        }
        ProductSerial::whereIn('id', $rows->pluck('id'))->update(['status' => $status]);
    }

    public static function forSaleItems(Collection $itemIds): Collection
    {
        return ProductSerial::whereIn('sale_item_id', $itemIds)->get()->groupBy('sale_item_id')->map->pluck('serial');
    }
}
