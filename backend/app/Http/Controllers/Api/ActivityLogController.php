<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(50, max(5, (int) $request->integer('per_page', 20)));
        $limit = $request->filled('limit') ? min(20, max(1, (int) $request->integer('limit'))) : null;

        $query = ActivityLog::query()
            ->with('user:id,name,username')
            ->where('subject_type', User::class)
            ->whereIn('action', [
                'user.created',
                'user.role_changed',
                'user.password_reset',
                'user.verification_resent',
                'user.deactivated',
                'user.activated',
                'user.deleted',
            ])
            ->latest();

        if ($limit) {
            return response()->json([
                'activity' => $query->limit($limit)->get(),
            ]);
        }

        $page = max(1, (int) $request->integer('page', 1));
        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'activity' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
        ]);
    }
}
