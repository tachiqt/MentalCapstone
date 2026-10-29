<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assessment;
use App\Models\Child;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AssessmentController extends Controller
{
    public function all(Request $request): JsonResponse
    {
        $childIds = ChildAccess::query($request->user())->select('id');

        $assessments = Assessment::query()
            ->whereIn('child_id', $childIds)
            ->with([
                'child:id,first_name,last_name',
                'checklist:id,title',
                'psychometrician:id,name,username',
                'aiRecommendations' => fn ($q) => $q
                    ->where('status', '!=', 'rejected')
                    ->latest()
                    ->limit(1)
                    ->select(['id', 'assessment_id', 'status', 'created_at']),
            ])
            ->withCount([
                'responses',
                'responses as scored_responses_count' => fn ($q) => $q
                    ->whereNotNull('score')
                    ->where('score', '!=', ''),
            ])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json($this->presentMany($assessments));
    }

    public function index(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $assessments = $child->assessments()
            ->with(['checklist', 'psychometrician', 'responses.checklistItem', 'aiRecommendations' => fn ($q) => $q->where('status', '!=', 'rejected')->latest()])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($this->presentMany($assessments));
    }

    public function store(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        if (! $child->is_active) {
            return response()->json([
                'message' => 'Cannot create assessments for an inactive child. Activate the child first.',
            ], 422);
        }

        $data = $request->validate([
            'checklist_id' => ['required', 'exists:assessment_checklists,id'],
            'severity_level' => ['nullable', 'string', 'max:32'],
            'conditions_json' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
            'responses' => ['required', 'array', 'min:1'],
            'responses.*.checklist_item_id' => ['required', 'exists:checklist_items,id'],
            'responses.*.score' => ['nullable', 'string', 'max:255'],
            'responses.*.comment' => ['nullable', 'string'],
        ]);

        $assessment = DB::transaction(function () use ($request, $child, $data) {
            $assessment = Assessment::create([
                'child_id' => $child->id,
                'assessment_checklist_id' => $data['checklist_id'],
                'psychometrician_id' => $request->user()->id,
                'severity_level' => $data['severity_level'] ?? null,
                'conditions_json' => $data['conditions_json'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => 'finalized',
            ]);

            foreach ($data['responses'] as $response) {
                $assessment->responses()->create([
                    'checklist_item_id' => $response['checklist_item_id'],
                    'score' => $response['score'] ?? null,
                    'comment' => $response['comment'] ?? null,
                ]);
            }

            return $assessment->load(['checklist', 'psychometrician', 'responses.checklistItem']);
        });

        return response()->json($this->presentOne($assessment), 201);
    }

    public function show(Request $request, Assessment $assessment): JsonResponse
    {
        $assessment->load(['child', 'checklist', 'psychometrician', 'responses.checklistItem', 'aiRecommendations' => fn ($q) => $q->where('status', '!=', 'rejected')->latest()]);

        if (! ChildAccess::canAccess($request->user(), $assessment->child)) {
            abort(403);
        }

        return response()->json($this->presentOne($assessment));
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Assessment>|array<int, Assessment>  $assessments
     */
    private function presentMany($assessments): \Illuminate\Support\Collection
    {
        return collect($assessments)->map(fn (Assessment $assessment) => $this->presentOne($assessment));
    }

    private function presentOne(Assessment $assessment): Assessment
    {
        $assessment->setAttribute('ai_generation_status', $assessment->resolveAiGenerationStatus());

        return $assessment;
    }
}
