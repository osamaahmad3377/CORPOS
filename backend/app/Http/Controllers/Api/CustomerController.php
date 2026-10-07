<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index()
    {
        return CustomerResource::collection(
            Customer::withCount('sales')
                ->withMax('sales', 'sale_date')
                ->withSum(['sales as total_due' => function ($query) {
                    // Held sales are unconfirmed drafts — nothing is actually owed yet.
                    $query->where('payment_status', '!=', 'paid')->where('status', '!=', 'held');
                }], DB::raw('(grand_total - paid_amount)'))
                ->orderBy('name')->get()
        );
    }

    public function store(StoreCustomerRequest $request)
    {
        $customer = Customer::create($request->validated())->refresh();

        return new CustomerResource($customer);
    }

    public function show(Customer $customer)
    {
        $customer->loadCount('sales')->loadMax('sales', 'sale_date');
        $customer->loadSum(['sales as total_due' => function ($query) {
            $query->where('payment_status', '!=', 'paid')->where('status', '!=', 'held');
        }], DB::raw('(grand_total - paid_amount)'));

        return new CustomerResource($customer);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer)
    {
        $customer->update($request->validated());

        return new CustomerResource($customer);
    }

    public function destroy(Customer $customer)
    {
        if ($customer->sales()->exists()) {
            return response()->json([
                'message' => 'This customer has existing sales and cannot be deleted.',
            ], 422);
        }

        $customer->delete();

        return response()->json(['message' => 'Customer deleted successfully.']);
    }
}
