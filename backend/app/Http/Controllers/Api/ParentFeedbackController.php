<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ParentFeedback;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ParentFeedbackController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'child_id' => ['nullable', 'exists:children,id'],
            'subject' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'message' => ['required', 'string'],
        ]);

        if (empty($data['child_id']) && $request->user()->role === UserRole::Parent) {
            $data['child_id'] = ChildAccess::query($request->user())->value('id');
        }

        if (empty($data['child_id'])) {
            return response()->json(['message' => 'No child linked to your account.'], 422);
        }

        $data['subject'] = ($data['subject'] ?? null) ?: 'Parent feedback';

        ChildAccess::findOrFail($request->user(), $data['child_id']);

        $feedback = ParentFeedback::create([
            ...$data,
            'parent_id' => $request->user()->id,
            'status' => 'open',
        ]);

        return response()->json($feedback->load(['parent', 'child']), 201);
    }

    public function mine(Request $request): JsonResponse
    {
        $childIds = ChildAccess::query($request->user())->pluck('children.id');

        $query = ParentFeedback::with(['parent', 'child'])
            ->whereIn('child_id', $childIds)
            ->orderByDesc('created_at');

        if ($request->user()->role === UserRole::Parent) {
            $query->where('parent_id', $request->user()->id);
        }

        return response()->json($query->get());
    }

    public function index(Request $request, int $child): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);

        $query = ParentFeedback::with(['parent', 'child', 'responder:id,name'])
            ->where('child_id', $child)
            ->orderByDesc('created_at');

        if ($request->user()->role === UserRole::Parent) {
            $query->where('parent_id', $request->user()->id);
        }

        return response()->json($query->get());
    }

    public function update(Request $request, ParentFeedback $parentFeedback): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $parentFeedback->child_id);

        if ($request->user()->role === UserRole::Parent) {
            return response()->json(['message' => 'Parents cannot update feedback status.'], 403);
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:open,acknowledged,addressed'],
            'staff_response' => ['nullable', 'string', 'max:2000'],
        ]);

        if (array_key_exists('staff_response', $data) || array_key_exists('status', $data)) {
            $data['responded_by'] = $request->user()->id;
            $data['responded_at'] = now();
            if (! array_key_exists('status', $data) && $parentFeedback->status === 'open') {
                $data['status'] = 'acknowledged';
            }
        }

        $parentFeedback->update($data);

        return response()->json($parentFeedback->fresh()->load(['parent', 'child', 'responder:id,name']));
    }
}
