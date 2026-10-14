<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProductVariant extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_id',
        'color',
        'size',
        'sku',
        'barcode',
        'purchase_price',
        'selling_price',
        'wholesale_price',
        'stock_qty',
        'low_stock_threshold',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'purchase_price' => 'decimal:2',
            'selling_price' => 'decimal:2',
            'wholesale_price' => 'decimal:2',
            'stock_qty' => 'float',
            'low_stock_threshold' => 'float',
            'is_active' => 'boolean',
        ];
    }

    /** Prefix a deleted variant's barcode gets, so the number is free again. */
    public const RELEASED_PREFIX = 'DEL-';

    /**
     * A deleted item gives its barcode back: the number can be used for a new
     * item straight away. The deleted variant row stays (old bills still point
     * at it) with its barcode renamed to DEL-<id>-<old barcode>, and its saved
     * barcode record is removed.
     */
    public function releaseBarcode(): void
    {
        Barcode::where('variant_id', $this->id)->delete();
        if ($this->barcode && ! str_starts_with($this->barcode, self::RELEASED_PREFIX)) {
            $this->forceFill(['barcode' => self::RELEASED_PREFIX.$this->id.'-'.$this->barcode])->saveQuietly();
        }
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(Barcode::class, 'variant_id');
    }

    public function purchaseItems(): HasMany
    {
        return $this->hasMany(PurchaseItem::class, 'variant_id');
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'variant_id');
    }

    public function stockAdjustments(): HasMany
    {
        return $this->hasMany(StockAdjustment::class, 'variant_id');
    }

    public function getIsLowStockAttribute(): bool
    {
        return $this->stock_qty <= $this->low_stock_threshold;
    }
}
