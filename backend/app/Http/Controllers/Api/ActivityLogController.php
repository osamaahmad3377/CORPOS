<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::with('user');

        if ($request->filled('module')) {
            $query->where('module', $request->string('module'));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->date('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->date('end_date'));
        }

        $logs = $query->orderByDesc('id')->paginate($request->integer('per_page', 30));

        $logs->getCollection()->transform(fn (ActivityLog $log) => [
            'id' => $log->id,
            'user_id' => $log->user_id,
            'user' => $log->user?->name,
            'action' => $log->action,
            'module' => $log->module,
            'description' => $log->description,
            'ip_address' => $log->ip_address,
            'created_at' => $log->created_at,
        ]);

        return response()->json($logs);
    }
}
