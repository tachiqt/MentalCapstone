<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\TherapyPlan;
use App\Models\TherapySession;
use App\Services\ScheduleSuggestionService;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TherapySessionController extends Controller
{
    public function __construct(
        private ScheduleSuggestionService $scheduleSuggestionService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TherapySession::query()
            ->whereIn('child_id', ChildAccess::query($request->user())->select('children.id'));

        if ($request->boolean('upcoming')) {
            $query->with([
                'child:id,first_name,last_name',
                'teacher:id,name',
            ])
                ->where('status', '!=', 'cancelled')
                ->where('scheduled_at', '>=', now()->subHour())
                ->orderBy('scheduled_at')
                ->limit(max(1, min(20, (int) $request->input('limit', 6))));
        } else {
            $query->with(['child', 'teacher', 'therapyPlan'])
                ->orderByDesc('scheduled_at');
        }

        if ($request->filled('child_id')) {
            $child = ChildAccess::findOrFail($request->user(), (int) $request->child_id);
            $query->where('child_id', $child->id);
        }

        if ($request->filled('teacher_id')) {
            $query->where('teacher_id', $request->teacher_id);
        }

        return response()->json($query->get()->map(function (TherapySession $session) {
            $childName = trim(($session->child?->first_name ?? '').' '.($session->child?->last_name ?? ''));

            return [
                ...$session->toArray(),
                'title' => $childName ? "Therapy — {$childName}" : 'Therapy Session',
                'notes' => $session->observations ?? $session->outcomes,
            ];
        }));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'therapy_plan_id' => ['nullable', 'exists:therapy_plans,id'],
            'child_id' => ['required', 'exists:children,id'],
            'teacher_id' => ['nullable', 'exists:users,id'],
            'scheduled_at' => ['required', 'date'],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:480'],
            'status' => ['nullable', 'string', 'in:scheduled,completed,cancelled'],
            'observations' => ['nullable', 'string'],
            'outcomes' => ['nullable', 'string'],
            'intervention_notes' => ['nullable', 'string'],
            'participation' => ['nullable', 'string', 'max:255'],
        ]);

        ChildAccess::findOrFail($request->user(), $data['child_id']);

        if ($mismatch = $this->therapyPlanChildMismatch($data['therapy_plan_id'] ?? null, (int) $data['child_id'])) {
            return $mismatch;
        }

        if ($request->user()->role === UserRole::Teacher) {
            $data['teacher_id'] = $request->user()->id;
        }

        if (empty($data['teacher_id'])) {
            return response()->json(['message' => 'Teacher is required.'], 422);
        }

        if (! ScheduleSuggestionService::scheduledAtWithinOperatingHours($data['scheduled_at'])) {
            return response()->json([
                'message' => 'Therapy sessions must be scheduled between '
                    .ScheduleSuggestionService::OPERATING_START.' and '
                    .ScheduleSuggestionService::OPERATING_END.' facility time.',
            ], 422);
        }

        $session = TherapySession::create([
            ...$data,
            'duration_minutes' => $data['duration_minutes'] ?? 60,
            'status' => $data['status'] ?? 'scheduled',
        ]);

        return response()->json($session->load(['child', 'teacher', 'therapyPlan']), 201);
    }

    public function update(Request $request, TherapySession $therapySession): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $therapySession->child_id);

        $data = $request->validate([
            'therapy_plan_id' => ['nullable', 'exists:therapy_plans,id'],
            'teacher_id' => ['sometimes', 'exists:users,id'],
            'scheduled_at' => ['sometimes', 'date'],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:480'],
            'status' => ['nullable', 'string', 'in:scheduled,completed,cancelled'],
            'observations' => ['nullable', 'string'],
            'outcomes' => ['nullable', 'string'],
            'intervention_notes' => ['nullable', 'string'],
            'participation' => ['nullable', 'string', 'max:255'],
        ]);

        if (array_key_exists('therapy_plan_id', $data)) {
            if ($mismatch = $this->therapyPlanChildMismatch($data['therapy_plan_id'], (int) $therapySession->child_id)) {
                return $mismatch;
            }
        }

        if ($request->user()->role === UserRole::Teacher) {
            $data['teacher_id'] = $request->user()->id;
        }

        if (array_key_exists('scheduled_at', $data)
            && ! ScheduleSuggestionService::scheduledAtWithinOperatingHours($data['scheduled_at'])) {
            return response()->json([
                'message' => 'Therapy sessions must be scheduled between '
                    .ScheduleSuggestionService::OPERATING_START.' and '
                    .ScheduleSuggestionService::OPERATING_END.' facility time.',
            ], 422);
        }

        $therapySession->update($data);

        return response()->json($therapySession->fresh()->load(['child', 'teacher', 'therapyPlan']));
    }

    public function destroy(Request $request, TherapySession $therapySession): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $therapySession->child_id);

        $therapySession->delete();

        return response()->json(['message' => 'Session deleted.']);
    }

    public function suggest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'child_id' => ['required', 'exists:children,id'],
            'teacher_id' => ['nullable', 'exists:users,id'],
            'therapy_plan_id' => ['nullable', 'exists:therapy_plans,id'],
            'sessions_per_week' => ['required', 'integer', 'min:1', 'max:7'],
            'start_date' => ['required', 'date'],
            'days' => ['nullable', 'array'],
            'days.*' => ['integer', 'min:1', 'max:7'],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:480'],
            'preferred_start_time' => ['nullable', 'date_format:H:i'],
        ]);

        ChildAccess::findOrFail($request->user(), $data['child_id']);

        if ($request->user()->role === UserRole::Teacher) {
            $data['teacher_id'] = $request->user()->id;
        }

        if (empty($data['teacher_id'])) {
            return response()->json(['message' => 'Teacher is required.'], 422);
        }

        $result = $this->scheduleSuggestionService->suggest($data);

        $payload = [
            'suggested_slots' => $result['slots'] ?? $result,
            'insight' => $result['insight'] ?? null,
            'basis' => $result['basis'] ?? null,
        ];

        if (array_key_exists('preferred_time_applied', $result)) {
            $payload['preferred_time_applied'] = $result['preferred_time_applied'];
        }
        if (! empty($result['message'])) {
            $payload['message'] = $result['message'];
        }

        return response()->json($payload);
    }

    private function therapyPlanChildMismatch(mixed $therapyPlanId, int $childId): ?JsonResponse
    {
        if ($therapyPlanId === null || $therapyPlanId === '') {
            return null;
        }

        $plan = TherapyPlan::query()->find((int) $therapyPlanId);
        if (! $plan || (int) $plan->child_id !== $childId) {
            return response()->json([
                'message' => 'The selected therapy plan does not belong to this child.',
            ], 422);
        }

        return null;
    }
}
