<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use Illuminate\Http\Request;

/** Kitchen screen: open (held) orders and their cooking status. */
class KitchenController extends Controller
{
    public function index()
    {
        $orders = Sale::with(['items.variant.product', 'cashier'])
            ->where('status', 'held')
            ->orderBy('created_at')
            ->get()
            ->map(fn (Sale $s) => [
                'invoice_number' => $s->invoice_number,
                'order_type' => $s->order_type,
                'table_no' => $s->table_no,
                'kitchen_status' => $s->kitchen_status ?: 'new',
                'notes' => $s->notes,
                'waiter' => $s->cashier?->name,
                'grand_total' => $s->grand_total,
                'created_at' => $s->created_at,
                'items' => $s->items->map(fn ($i) => [
                    'id' => $i->id,
                    'name' => $i->variant?->product?->name,
                    'color' => $i->variant?->color,
                    'size' => $i->variant?->size,
                    'quantity' => (float) $i->quantity,
                ]),
            ]);

        return response()->json(['data' => $orders]);
    }

    public function status(Request $request, Sale $sale)
    {
        $data = $request->validate(['status' => ['required', 'in:new,preparing,ready,served']]);
        abort_unless($sale->status === 'held', 422, 'This order is already paid.');
        $sale->kitchen_status = $data['status'];
        $sale->save();

        return response()->json(['invoice_number' => $sale->invoice_number, 'kitchen_status' => $sale->kitchen_status]);
    }
}
