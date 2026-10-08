<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SavePromotionRequest;
use App\Http\Resources\PromotionResource;
use App\Models\Promotion;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Offers the POS applies automatically (see App\Services\SalePricing).
 */
class PromotionController extends Controller
{
    /** All offers, newest first. ?status=active|scheduled|expired|off */
    public function index(Request $request)
    {
        $promotions = Promotion::with(['category', 'product'])
            ->addSelect(['sale_items_count' => DB::table('sale_items')
                ->selectRaw('count(*)')
                ->whereColumn('sale_items.promotion_id', 'promotions.id')])
            ->orderByDesc('id')
            ->get();

        if ($request->filled('status')) {
            $promotions = $promotions->where('status', $request->string('status')->toString())->values();
        }

        return PromotionResource::collection($promotions);
    }

    /** Offers running today — for the POS to show "offer" badges. */
    public function active()
    {
        return PromotionResource::collection(Promotion::running()->with(['category', 'product'])->orderBy('id')->get());
    }

    public function show(Promotion $promotion)
    {
        return new PromotionResource($promotion->load(['category', 'product']));
    }

    public function store(SavePromotionRequest $request)
    {
        $promotion = Promotion::create($request->promotionData() + ['created_by' => $request->user()->id]);
        ActivityLogger::log($request->user(), 'create', 'promotions', "Created offer \"{$promotion->name}\".");

        return (new PromotionResource($promotion->fresh(['category', 'product'])))->response()->setStatusCode(201);
    }

    public function update(SavePromotionRequest $request, Promotion $promotion)
    {
        $promotion->update($request->promotionData());
        ActivityLogger::log($request->user(), 'update', 'promotions', "Updated offer \"{$promotion->name}\".");

        return new PromotionResource($promotion->fresh(['category', 'product']));
    }

    public function destroy(Request $request, Promotion $promotion)
    {
        // Soft delete: old bills keep showing which offer they got.
        $promotion->delete();
        ActivityLogger::log($request->user(), 'delete', 'promotions', "Deleted offer \"{$promotion->name}\".");

        return response()->json(['message' => 'Offer deleted.']);
    }
}
