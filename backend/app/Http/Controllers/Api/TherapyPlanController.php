<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TherapyPlan;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TherapyPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = TherapyPlan::query()
            ->whereIn('child_id', ChildAccess::query($request->user())->select('children.id'))
            ->with([
                'child:id,first_name,last_name',
                'teacher:id,name',
            ])
            ->orderByDesc('created_at');

        if ($request->filled('child_id')) {
            $child = ChildAccess::findOrFail($request->user(), (int) $request->child_id);
            $query->where('child_id', $child->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'sessions_per_week' => ['nullable', 'integer', 'min:1', 'max:7'],
            'status' => ['nullable', 'string', 'in:active,archived'],
        ]);

        ChildAccess::findOrFail($request->user(), (int) $data['child_id']);

        $plan = TherapyPlan::create([
            'child_id' => $data['child_id'],
            'teacher_id' => $request->user()->id,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'sessions_per_week' => $data['sessions_per_week'] ?? 2,
            'status' => $data['status'] ?? 'active',
        ]);

        return response()->json($plan->load(['child:id,first_name,last_name', 'teacher:id,name']), 201);
    }

    public function update(Request $request, TherapyPlan $therapyPlan): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $therapyPlan->child_id);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'sessions_per_week' => ['nullable', 'integer', 'min:1', 'max:7'],
            'status' => ['nullable', 'string', 'in:active,archived'],
        ]);

        $therapyPlan->update($data);

        return response()->json($therapyPlan->fresh()->load(['child:id,first_name,last_name', 'teacher:id,name']));
    }
}
