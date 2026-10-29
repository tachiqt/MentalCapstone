<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Enums\UserRole;
use App\Models\ActivityLog;
use App\Models\Child;
use App\Models\ChildStatusHistory;
use App\Models\DiagnosisHistory;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\ChildAccess;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChildController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $userId = $user->id;
        $trashed = $request->boolean('trashed');
        $status = strtolower((string) $request->input('status', $trashed ? 'deleted' : 'active'));

        if ($trashed || $status === 'deleted') {
            if ($user->role !== UserRole::HeadDoctor) {
                abort(403);
            }

            $children = QueryCache::remember(
                QueryCache::childrenKey($userId).':trashed',
                120,
                function () use ($user) {
                    return ChildAccess::query($user)
                        ->onlyTrashed()
                        ->with('users')
                        ->orderBy('last_name')
                        ->orderBy('first_name')
                        ->get();
                }
            );

            return response()->json($children);
        }

        if (! in_array($status, ['active', 'inactive', 'all'], true)) {
            $status = 'active';
        }

        $children = QueryCache::remember(
            QueryCache::childrenKey($userId).':'.$status,
            120,
            function () use ($request, $status) {
                $query = ChildAccess::query($request->user())->with('users');

                if ($status === 'active') {
                    $query->where('is_active', true);
                } elseif ($status === 'inactive') {
                    $query->where('is_active', false);
                }

                return $query
                    ->orderBy('last_name')
                    ->orderBy('first_name')
                    ->get();
            }
        );

        return response()->json($children);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date'],
            'sex' => ['nullable', 'string', 'max:20'],
            'condition_notes' => ['nullable', 'string'],
            'diagnosis' => ['nullable', 'string', 'max:255'],
            'age_band' => ['nullable', 'integer', 'min:0', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $child = Child::create($data);

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($child, 201);
    }

    public function show(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $child->load('users');

        return response()->json($child);
    }

    public function update(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:255'],
            'last_name' => ['sometimes', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date'],
            'sex' => ['nullable', 'string', 'max:20'],
            'condition_notes' => ['nullable', 'string'],
            'diagnosis' => ['nullable', 'string', 'max:255'],
            'age_band' => ['nullable', 'integer', 'min:0', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
            'assessment_id' => ['nullable', 'exists:assessments,id'],
            'diagnosis_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $assessmentId = $data['assessment_id'] ?? null;
        $diagnosisNote = $data['diagnosis_note'] ?? null;
        unset($data['assessment_id'], $data['diagnosis_note']);

        if (array_key_exists('diagnosis', $data)) {
            $this->recordDiagnosisChange(
                $child,
                $request->user()->id,
                $data['diagnosis'],
                $assessmentId,
                $diagnosisNote
            );
        }

        if (array_key_exists('is_active', $data) && (bool) $data['is_active'] !== (bool) $child->is_active) {
            $this->applyFacilityStatus(
                $child,
                $request->user()->id,
                (bool) $data['is_active'] ? 'activated' : 'inactivated',
                null,
                false
            );
            unset($data['is_active']);
        }

        if ($data !== []) {
            $child->update($data);
        }

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($child->fresh()->load('users'));
    }

    public function deactivate(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! $child->is_active) {
            return response()->json($child->load('users'));
        }

        $this->applyFacilityStatus(
            $child,
            $request->user()->id,
            'inactivated',
            $data['note'] ?? null
        );

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($child->fresh()->load('users'));
    }

    public function activate(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($child->is_active) {
            return response()->json($child->load('users'));
        }

        $this->applyFacilityStatus(
            $child,
            $request->user()->id,
            'activated',
            $data['note'] ?? null
        );

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($child->fresh()->load('users'));
    }

    public function destroy(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $previous = $child->facilityStatus();
        $child->delete();

        ChildStatusHistory::create([
            'child_id' => $child->id,
            'previous_status' => $previous,
            'new_status' => 'deleted',
            'action' => 'deleted',
            'changed_by' => $request->user()->id,
            'note' => $data['note'] ?? null,
        ]);

        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'child.deleted',
            'subject_type' => Child::class,
            'subject_id' => $child->id,
            'meta' => [
                'previous_status' => $previous,
                'new_status' => 'deleted',
                'child_name' => trim($child->first_name.' '.$child->last_name),
            ],
        ]);

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json(['ok' => true]);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $record = Child::withTrashed()->findOrFail($id);

        if (! ChildAccess::canAccess($request->user(), $record)) {
            abort(403);
        }

        if (! $record->trashed()) {
            return response()->json($record->load('users'));
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $record->restore();
        $record->update(['is_active' => false]);

        ChildStatusHistory::create([
            'child_id' => $record->id,
            'previous_status' => 'deleted',
            'new_status' => 'inactive',
            'action' => 'restored',
            'changed_by' => $request->user()->id,
            'note' => $data['note'] ?? null,
        ]);

        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'child.restored',
            'subject_type' => Child::class,
            'subject_id' => $record->id,
            'meta' => [
                'previous_status' => 'deleted',
                'new_status' => 'inactive',
                'child_name' => trim($record->first_name.' '.$record->last_name),
            ],
        ]);

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($record->fresh()->load('users'));
    }

    public function statusHistory(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $history = ChildStatusHistory::query()
            ->where('child_id', $child->id)
            ->with(['changer:id,name'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($history);
    }

    public function updateDiagnosis(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'diagnosis' => ['nullable', 'string', 'max:255'],
            'assessment_id' => ['nullable', 'exists:assessments,id'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->recordDiagnosisChange(
            $child,
            $request->user()->id,
            $data['diagnosis'] ?? null,
            $data['assessment_id'] ?? null,
            $data['note'] ?? null
        );

        $child->update(['diagnosis' => $data['diagnosis'] ?? null]);

        $this->forgetChildrenCaches($request->user()->id);

        return response()->json($child->fresh()->load('users'));
    }

    public function diagnosisHistory(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $history = DiagnosisHistory::query()
            ->where('child_id', $child->id)
            ->with(['changer:id,name', 'assessment:id,created_at'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($history);
    }

    private function applyFacilityStatus(
        Child $child,
        int $userId,
        string $action,
        ?string $note = null,
        bool $persist = true
    ): void {
        $previous = $child->facilityStatus();
        $nextActive = $action === 'activated';
        $newStatus = $nextActive ? 'active' : 'inactive';

        if ($persist) {
            $child->update(['is_active' => $nextActive]);
        } else {
            $child->is_active = $nextActive;
            $child->save();
        }

        ChildStatusHistory::create([
            'child_id' => $child->id,
            'previous_status' => $previous,
            'new_status' => $newStatus,
            'action' => $action,
            'changed_by' => $userId,
            'note' => $note,
        ]);

        ActivityLog::create([
            'user_id' => $userId,
            'action' => $action === 'activated' ? 'child.activated' : 'child.inactivated',
            'subject_type' => Child::class,
            'subject_id' => $child->id,
            'meta' => [
                'previous_status' => $previous,
                'new_status' => $newStatus,
                'child_name' => trim($child->first_name.' '.$child->last_name),
            ],
        ]);
    }

    private function forgetChildrenCaches(int $userId): void
    {
        QueryCache::forget(
            QueryCache::childrenKey($userId),
            QueryCache::childrenKey($userId).':active',
            QueryCache::childrenKey($userId).':inactive',
            QueryCache::childrenKey($userId).':all',
            QueryCache::childrenKey($userId).':trashed',
        );
    }

    private function recordDiagnosisChange(
        Child $child,
        int $userId,
        ?string $newDiagnosis,
        mixed $assessmentId = null,
        ?string $note = null
    ): void {
        $previous = $child->diagnosis;
        $next = $newDiagnosis !== null && $newDiagnosis !== '' ? $newDiagnosis : null;

        if ((string) ($previous ?? '') === (string) ($next ?? '')) {
            return;
        }

        DiagnosisHistory::create([
            'child_id' => $child->id,
            'assessment_id' => $assessmentId ? (int) $assessmentId : null,
            'previous_diagnosis' => $previous,
            'new_diagnosis' => $next,
            'changed_by' => $userId,
            'note' => $note,
        ]);

        ActivityLog::create([
            'user_id' => $userId,
            'action' => 'child.diagnosis_updated',
            'subject_type' => Child::class,
            'subject_id' => $child->id,
            'meta' => [
                'previous_diagnosis' => $previous,
                'new_diagnosis' => $next,
                'assessment_id' => $assessmentId ? (int) $assessmentId : null,
            ],
        ]);
    }

    public function assign(Request $request, Child $child): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'relation' => ['required', 'string', 'max:32'],
        ]);

        $relation = strtolower($data['relation']);
        $assignee = User::findOrFail($data['user_id']);
        $expectedRole = match ($relation) {
            'teacher' => UserRole::Teacher,
            'caretaker' => UserRole::Caretaker,
            'parent' => UserRole::Parent,
            default => null,
        };

        if ($expectedRole && $assignee->role !== $expectedRole) {
            return response()->json([
                'message' => 'Selected user cannot be assigned with relation '.$relation.'.',
            ], 422);
        }

        $previousIds = $child->users()
            ->wherePivot('relation', $relation)
            ->pluck('users.id')
            ->all();

        foreach ($previousIds as $previousId) {
            if ((int) $previousId !== (int) $assignee->id) {
                $child->users()->detach($previousId);
                $this->forgetChildrenCaches((int) $previousId);
            }
        }

        $child->users()->syncWithoutDetaching([
            $assignee->id => ['relation' => $relation],
        ]);

        $this->forgetChildrenCaches($request->user()->id);
        $this->forgetChildrenCaches($assignee->id);

        if ((int) $assignee->id !== (int) $request->user()->id) {
            $this->notifications->notifyUser(
                $assignee,
                'record.assignment',
                'You were assigned a child',
                trim($child->first_name.' '.$child->last_name).' is now in your care.',
                ['section' => 'children', 'id' => $child->id]
            );
        }

        return response()->json($child->fresh()->load('users'));
    }

    public function assignBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'relation' => ['required', 'string', 'max:32'],
            'child_ids' => ['required', 'array', 'min:1'],
            'child_ids.*' => ['integer', 'exists:children,id'],
        ]);

        $assignee = User::findOrFail($data['user_id']);
        $relation = strtolower($data['relation']);
        $expectedRole = match ($relation) {
            'teacher' => UserRole::Teacher,
            'caretaker' => UserRole::Caretaker,
            'parent' => UserRole::Parent,
            default => null,
        };

        if ($expectedRole && $assignee->role !== $expectedRole) {
            return response()->json([
                'message' => 'Selected user cannot be assigned with relation '.$relation.'.',
            ], 422);
        }

        $children = Child::query()->whereIn('id', $data['child_ids'])->get();
        $assigned = [];

        foreach ($children as $child) {
            $previousIds = $child->users()
                ->wherePivot('relation', $relation)
                ->pluck('users.id')
                ->all();

            foreach ($previousIds as $previousId) {
                if ((int) $previousId !== (int) $assignee->id) {
                    $child->users()->detach($previousId);
                    $this->forgetChildrenCaches((int) $previousId);
                }
            }

            $child->users()->syncWithoutDetaching([
                $assignee->id => ['relation' => $relation],
            ]);
            $assigned[] = $child->id;
            $this->forgetChildrenCaches($assignee->id);
        }

        $this->forgetChildrenCaches($request->user()->id);

        if ((int) $assignee->id !== (int) $request->user()->id && $assigned !== []) {
            $this->notifications->notifyUser(
                $assignee,
                'record.assignment',
                'Children were assigned to you',
                count($assigned).' child'.(count($assigned) === 1 ? '' : 'ren').' added to your care list.',
                ['section' => 'children']
            );
        }

        return response()->json([
            'user_id' => $assignee->id,
            'relation' => $relation,
            'child_ids' => $assigned,
            'assigned_count' => count($assigned),
        ]);
    }
}
