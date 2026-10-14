<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Barcode;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Services\ActivityLogger;
use App\Services\BarcodeGenerator;
use App\Services\SkuGenerator;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Items import / export (CSV and Excel are read and written in the app; this
 * deals in plain rows). One row = one item type (size / colour…); rows with
 * the same item name become one item with several types.
 */
class ItemTransferController extends Controller
{
    /** Every item type as a flat row, for the export file. */
    public function export()
    {
        $variants = ProductVariant::with(['product.category.parent', 'product.brand'])
            ->whereHas('product')->orderBy('product_id')->orderBy('id')->get();

        $rows = $variants->map(function (ProductVariant $v) {
            $p = $v->product;
            $cat = $p->category;

            return [
                'name' => $p->name,
                'category' => $cat ? ($cat->parent ? $cat->parent->name.' > '.$cat->name : $cat->name) : '',
                'brand' => $p->brand?->name ?? '',
                'unit' => $p->unit,
                'option1' => $v->color ?? '',
                'option2' => $v->size ?? '',
                'barcode' => $v->barcode,
                'sku' => $v->sku,
                'purchase_price' => (float) $v->purchase_price,
                'selling_price' => (float) $v->selling_price,
                'wholesale_price' => $v->wholesale_price !== null ? (float) $v->wholesale_price : '',
                'stock_qty' => $p->track_stock === false ? '' : (float) $v->stock_qty,
                'low_stock_threshold' => (float) $v->low_stock_threshold,
                'description' => $p->description ?? '',
                'active' => $p->is_active ? 'yes' : 'no',
            ];
        });

        return response()->json(['data' => $rows, 'units' => array_keys(config('pos.units'))]);
    }

    /**
     * rows: [{ name, category, brand, unit, option1, option2, barcode,
     *          purchase_price, selling_price, wholesale_price, stock_qty,
     *          low_stock_threshold, description }]
     *
     * Items are matched by NAME (and type — option1 / option2), never by
     * barcode: barcodes in old files are often wrong, and uploading the
     * file again must fix them. update_existing: items already here get
     * the barcode, prices, stock, category, brand and description from the
     * file.
     */
    public function import(Request $request)
    {
        $data = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:500'],
            'rows.*' => ['array'],
            'update_existing' => ['sometimes', 'boolean'],
            'start_row' => ['sometimes', 'integer', 'min:1'],
        ]);
        $update = (bool) ($data['update_existing'] ?? false);
        $startRow = (int) ($data['start_row'] ?? 2);
        $user = $request->user();
        $restaurant = Setting::where('key', 'business.type')->value('value') === 'restaurant';

        $result = ['created_items' => 0, 'created_types' => 0, 'updated' => 0, 'unchanged' => 0, 'categories' => 0, 'barcodes_changed' => 0, 'skipped' => [], 'notes' => []];
        $catCache = [];
        $brandCache = [];

        foreach ($data['rows'] as $i => $raw) {
            $rowNo = $startRow + $i;
            $r = $this->clean($raw);
            if ($r['name'] === '') {
                $result['skipped'][] = ['row' => $rowNo, 'reason' => 'No item name'];
                continue;
            }
            if ($r['selling_price'] === null) {
                $result['skipped'][] = ['row' => $rowNo, 'name' => $r['name'], 'reason' => 'No selling price'];
                continue;
            }
            if ($r['barcode_damaged']) {
                $result['notes'][] = ['row' => $rowNo, 'name' => $r['name'], 'code' => 'barcode_spoiled'];
            }

            try {
                DB::transaction(function () use ($r, $update, $user, $restaurant, $rowNo, &$result, &$catCache, &$brandCache) {
                    $product = $this->findByName($r['name']);
                    $variant = $product ? $this->findType($product, $r['option1'], $r['option2']) : null;

                    if ($variant) {
                        if (! $update) {
                            $result['unchanged']++;

                            return;
                        }
                        $this->updateExisting($product, $variant, $r, $user, $rowNo, $result, $catCache, $brandCache);
                        $result['updated']++;

                        return;
                    }

                    // a new type of an item already here, or a new item
                    if (! $product) {
                        [$categoryId, $made] = $this->category($r['category'], $catCache);
                        $result['categories'] += $made;
                        $product = Product::create([
                            'name' => $r['name'],
                            'slug' => $this->uniqueSlug($r['name']),
                            'category_id' => $categoryId,
                            'brand_id' => $r['brand'] ? $this->brand($r['brand'], $brandCache) : null,
                            'description' => $r['description'] ?: null,
                            'unit' => $r['unit'],
                            'track_stock' => ! $restaurant,
                            'is_active' => true,
                        ]);
                        $result['created_items']++;
                    } else {
                        $result['created_types']++;
                    }

                    $variant = ProductVariant::create([
                        'product_id' => $product->id,
                        'color' => $r['option1'],
                        'size' => $r['option2'],
                        'sku' => SkuGenerator::generate($product, $r['option1'], $r['option2']),
                        'barcode' => 'TMP-'.Str::random(10),
                        'purchase_price' => $r['purchase_price'] ?? 0,
                        'selling_price' => $r['selling_price'],
                        'wholesale_price' => $r['wholesale_price'],
                        'stock_qty' => 0,
                        'low_stock_threshold' => $r['low_stock_threshold'] ?? 5,
                    ]);
                    if (! $r['barcode'] || ! $this->setBarcode($variant, $r['barcode'], $rowNo, $r['name'], $result)) {
                        BarcodeGenerator::assignToVariant($product, $variant);
                    }
                    if ($product->track_stock !== false && ($r['stock_qty'] ?? 0) > 0) {
                        StockService::increment($variant, $r['stock_qty'], 'in', $user, null, 'Opening stock (import)');
                    }
                });
            } catch (\Throwable $e) {
                $msg = $e instanceof \Illuminate\Validation\ValidationException ? collect($e->errors())->flatten()->first() : 'Could not save this row';
                $result['skipped'][] = ['row' => $rowNo, 'name' => $r['name'], 'reason' => $msg];
            }
        }

        $made = $result['created_items'] + $result['created_types'];
        ActivityLogger::log($user, 'import', 'products', "Imported items: {$made} new, {$result['updated']} updated ({$result['barcodes_changed']} barcodes changed), ".count($result['skipped']).' skipped.');

        return response()->json($result);
    }

    /** The item with this name (spaces and capitals don't matter). */
    private function findByName(string $name): ?Product
    {
        return Product::whereRaw('lower(trim(name)) = ?', [mb_strtolower($name)])->orderBy('id')->first();
    }

    /** The type with these options. An item with one type matches a row without options. */
    private function findType(Product $product, ?string $option1, ?string $option2): ?ProductVariant
    {
        $variant = $product->variants()
            ->whereRaw("lower(trim(coalesce(color, ''))) = ?", [mb_strtolower($option1 ?? '')])
            ->whereRaw("lower(trim(coalesce(size, ''))) = ?", [mb_strtolower($option2 ?? '')])
            ->first();
        if ($variant) {
            return $variant;
        }
        $types = $product->variants()->get();
        if ($option1 === null && $option2 === null) {
            return $types->count() === 1 ? $types->first() : null;
        }
        // the same options in the other column ("500ml" under Size in the
        // file, saved as the first option here)
        $want = $this->optionSet($option1, $option2);

        return $types->first(fn (ProductVariant $v) => $this->optionSet($v->color, $v->size) === $want);
    }

    private function optionSet(?string $a, ?string $b): string
    {
        $set = array_values(array_filter([mb_strtolower(trim((string) $a)), mb_strtolower(trim((string) $b))], 'strlen'));
        sort($set);

        return implode('|', $set);
    }

    private function updateExisting(Product $product, ProductVariant $variant, array $r, $user, int $rowNo, array &$result, array &$catCache, array &$brandCache): void
    {
        $variant->update(array_filter([
            'selling_price' => $r['selling_price'],
            'purchase_price' => $r['purchase_price'],
            'wholesale_price' => $r['wholesale_price'],
            'low_stock_threshold' => $r['low_stock_threshold'],
        ], fn ($v) => $v !== null));

        $productChanges = [];
        if ($r['category'] !== '') {
            [$categoryId, $made] = $this->category($r['category'], $catCache);
            $result['categories'] += $made;
            $productChanges['category_id'] = $categoryId;
        }
        if ($r['brand'] !== '') {
            $productChanges['brand_id'] = $this->brand($r['brand'], $brandCache);
        }
        if ($r['description'] !== '') {
            $productChanges['description'] = $r['description'];
        }
        if ($productChanges) {
            $product->update($productChanges);
        }

        if ($r['barcode'] && $r['barcode'] !== $variant->barcode) {
            $this->setBarcode($variant, $r['barcode'], $rowNo, $r['name'], $result);
        }

        if ($r['stock_qty'] !== null && $product->track_stock !== false) {
            $delta = round($r['stock_qty'] - (float) $variant->stock_qty, 3);
            if ($delta != 0.0) {
                StockService::adjust($variant, $delta, 'adjustment', $user, 'Import (stock set from file)');
            }
        }
    }

    /**
     * Give the type this barcode, replacing its old one(s). Refused (with a
     * note) when another item uses the barcode. A deleted item's barcode is
     * freed first.
     */
    private function setBarcode(ProductVariant $variant, string $code, int $rowNo, string $name, array &$result): bool
    {
        $owner = ProductVariant::withTrashed()->where('barcode', $code)->where('id', '!=', $variant->id)->first();
        $ownerId = $owner?->id ?? Barcode::where('barcode_number', $code)->where('variant_id', '!=', $variant->id)->value('variant_id');
        if ($ownerId) {
            $owner ??= ProductVariant::withTrashed()->find($ownerId);
            if ($owner && ($owner->trashed() || ! $owner->product)) {
                $owner->releaseBarcode();
            } else {
                $other = $owner?->product?->name ?? '?';
                $result['notes'][] = ['row' => $rowNo, 'name' => $name, 'code' => 'barcode_taken', 'barcode' => $code, 'other' => $other];

                return false;
            }
        }

        $replacing = ! str_starts_with((string) $variant->barcode, 'TMP-');
        Barcode::where('variant_id', $variant->id)->where('barcode_number', '!=', $code)->delete();
        BarcodeGenerator::assignCustom($variant, $code);
        if ($replacing) {
            $result['barcodes_changed']++;
        }

        return true;
    }

    // ------------------------------------------------------------ helpers

    private function clean(array $raw): array
    {
        $s = fn ($k, $max = 255) => mb_substr(trim((string) ($raw[$k] ?? '')), 0, $max);
        $n = function ($k) use ($raw) {
            $v = $raw[$k] ?? null;
            if ($v === null || $v === '') {
                return null;
            }
            $v = preg_replace('/[^0-9.\-]/', '', str_replace(',', '', (string) $v)); // "Rs 1,250" -> 1250

            return is_numeric($v) ? max(0, round((float) $v, 3)) : null;
        };
        $barcode = ltrim(preg_replace('/\s+/', '', $s('barcode', 64)), "'"); // '0123 = text in Excel
        $barcode = preg_replace('/^(\d+)\.0+$/', '$1', $barcode); // 8964000123456.0
        $damaged = (bool) preg_match('/^\d+([.,]\d+)?E\+?\d+$/i', $barcode);
        if ($damaged) {
            $barcode = ''; // Excel turned a long barcode into 8.97E+12 — the digits are lost
        }

        return [
            'name' => preg_replace('/\s+/u', ' ', $s('name')),
            'category' => $s('category'),
            'brand' => $s('brand', 120),
            'unit' => $this->unit($s('unit', 30)),
            'option1' => $s('option1', 60) ?: null,
            'option2' => $s('option2', 60) ?: null,
            'barcode' => $barcode ?: null,
            'barcode_damaged' => $damaged,
            'purchase_price' => $n('purchase_price'),
            'selling_price' => $n('selling_price'),
            'wholesale_price' => $n('wholesale_price'),
            'stock_qty' => $n('stock_qty'),
            'low_stock_threshold' => $n('low_stock_threshold'),
            'description' => $s('description', 2000),
        ];
    }

    /** "Piece", "PCS", "kgs", "Litre"… -> our unit codes. */
    private function unit(string $u): string
    {
        $u = mb_strtolower(trim($u, " .\t"));
        $map = [
            'pcs' => ['pc', 'pcs', 'piece', 'pieces', 'nos', 'no', 'unit', 'units', 'each', 'ea', 'qty'],
            'kg' => ['kg', 'kgs', 'kilo', 'kilogram', 'kilograms'], 'g' => ['g', 'gm', 'gms', 'gram', 'grams'],
            'litre' => ['l', 'ltr', 'litre', 'liter', 'litres', 'liters'], 'ml' => ['ml', 'millilitre', 'milliliter'],
            'dozen' => ['dz', 'doz', 'dozen'], 'box' => ['box', 'boxes'], 'pack' => ['pack', 'pkt', 'packet', 'packs'],
            'carton' => ['ctn', 'carton', 'cartons'], 'pair' => ['pair', 'pairs'], 'meter' => ['m', 'mtr', 'meter', 'metre', 'meters'],
            'foot' => ['ft', 'foot', 'feet'], 'yard' => ['yd', 'yard', 'yards'], 'plate' => ['plate', 'plates'],
            'sqft' => ['sqft', 'sq ft', 'square foot', 'square feet'], 'hour' => ['hr', 'hour', 'hours'], 'service' => ['service'],
        ];
        foreach ($map as $code => $words) {
            if (in_array($u, $words, true)) {
                return $code;
            }
        }

        return array_key_exists($u, config('pos.units')) ? $u : (Setting::where('key', 'product.default_unit')->value('value') ?: 'pcs');
    }

    /** "Drinks > Cold drinks" makes both levels; blank -> "General". */
    private function category(string $path, array &$cache): array
    {
        $parts = array_values(array_filter(array_map('trim', preg_split('/\s*(?:>|\/|\\\\)\s*/', $path ?: 'General')), 'strlen')) ?: ['General'];
        $parts = array_slice($parts, 0, 2);
        $made = 0;
        $parentId = null;
        foreach ($parts as $name) {
            $key = mb_strtolower(($parentId ?? '0').'|'.$name);
            if (! isset($cache[$key])) {
                $cat = Category::where('parent_id', $parentId)->whereRaw('lower(name) = ?', [mb_strtolower($name)])->first();
                if (! $cat) {
                    $cat = Category::create(['name' => mb_substr($name, 0, 120), 'slug' => $this->uniqueCategorySlug($name), 'parent_id' => $parentId, 'is_active' => true]);
                    $made++;
                }
                $cache[$key] = $cat->id;
            }
            $parentId = $cache[$key];
        }

        return [$parentId, $made];
    }

    private function brand(string $name, array &$cache): int
    {
        $key = mb_strtolower($name);
        if (! isset($cache[$key])) {
            $b = Brand::whereRaw('lower(name) = ?', [$key])->first()
                ?? Brand::create(['name' => $name, 'slug' => $this->uniqueSlugFor(Brand::class, $name), 'is_active' => true]);
            $cache[$key] = $b->id;
        }

        return $cache[$key];
    }

    private function uniqueSlug(string $name): string
    {
        return $this->uniqueSlugFor(Product::class, $name);
    }

    private function uniqueCategorySlug(string $name): string
    {
        return $this->uniqueSlugFor(Category::class, $name);
    }

    private function uniqueSlugFor(string $model, string $name): string
    {
        $base = Str::slug($name) ?: 'item';
        $slug = $base;
        $n = 2;
        while ($model::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$n++;
        }

        return $slug;
    }
}
