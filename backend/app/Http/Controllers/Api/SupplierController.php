<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSupplierRequest;
use App\Http\Requests\UpdateSupplierRequest;
use App\Http\Resources\SupplierResource;
use App\Models\Supplier;
use Illuminate\Support\Facades\DB;

class SupplierController extends Controller
{
    public function index()
    {
        return SupplierResource::collection(
            Supplier::withSum(['purchases as outstanding_balance' => function ($query) {
                $query->where('payment_status', '!=', 'paid');
            }], DB::raw('(grand_total - paid_amount)'))->orderBy('name')->get()
        );
    }

    public function store(StoreSupplierRequest $request)
    {
        $supplier = Supplier::create($request->validated())->refresh();

        return new SupplierResource($supplier);
    }

    public function show(Supplier $supplier)
    {
        $supplier->loadSum(['purchases as outstanding_balance' => function ($query) {
            $query->where('payment_status', '!=', 'paid');
        }], DB::raw('(grand_total - paid_amount)'));

        return new SupplierResource($supplier);
    }

    public function update(UpdateSupplierRequest $request, Supplier $supplier)
    {
        $supplier->update($request->validated());

        return new SupplierResource($supplier);
    }

    public function destroy(Supplier $supplier)
    {
        if ($supplier->purchases()->exists()) {
            return response()->json([
                'message' => 'This supplier has existing purchases and cannot be deleted. Deactivate it instead.',
            ], 422);
        }

        $supplier->delete();

        return response()->json(['message' => 'Supplier deleted successfully.']);
    }
}
