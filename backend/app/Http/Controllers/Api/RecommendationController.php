<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\Child;
use App\Models\TherapyPlan;
use App\Services\OpenAIRecommendationService;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RecommendationController extends Controller
{
    public function __construct(
        private OpenAIRecommendationService $openAIRecommendationService
    ) {}

    public function generate(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        if (! $child->is_active) {
            return response()->json([
                'message' => 'Cannot generate recommendations for an inactive child. Activate the child first.',
            ], 422);
        }

        $data = $request->validate([
            'assessment_id' => ['nullable', 'exists:assessments,id'],
        ]);

        $assessment = isset($data['assessment_id'])
            ? Assessment::where('child_id', $child->id)->findOrFail($data['assessment_id'])
            : $child->assessments()->latest()->firstOrFail();

        $blocking = $assessment->aiRecommendations()
            ->whereIn('status', ['pending_review', 'approved', 'modified'])
            ->exists();

        if ($blocking) {
            return response()->json([
                'message' => 'This assessment already has an AI recommendation that is pending review or approved.',
            ], 422);
        }

        $recommendation = $this->openAIRecommendationService->generate($assessment);

        return response()->json($recommendation->load(['child', 'assessment']), 201);
    }

    public function index(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $recommendations = $child->aiRecommendations()
            ->where('status', '!=', 'rejected')
            ->with(['assessment', 'reviewer'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($recommendations);
    }

    public function feed(Request $request): JsonResponse
    {
        $status = $request->input('status', 'pending_review');
        if ($status === 'pending') {
            $status = 'pending_review';
        }

        $childIds = ChildAccess::query($request->user())->pluck('children.id');

        $recommendations = AiRecommendation::query()
            ->whereIn('child_id', $childIds)
            ->where('status', $status)
            ->with(['child', 'assessment'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (AiRecommendation $rec) => [
                'id' => $rec->id,
                'child_id' => $rec->child_id,
                'status' => $rec->status,
                'title' => 'AI plan for '.trim(($rec->child?->first_name ?? '').' '.($rec->child?->last_name ?? '')),
                'description' => $rec->openai_response_json['developmental_summary'] ?? 'AI-generated therapy recommendation.',
                'content' => $rec->openai_response_json['developmental_summary'] ?? null,
                'clinical_basis' => $rec->openai_response_json['clinical_basis'] ?? null,
                'focus_areas' => $rec->openai_response_json['focus_areas'] ?? [],
                'priority_goals' => $rec->openai_response_json['priority_goals'] ?? [],
                'suggested_activities' => $rec->openai_response_json['suggested_activities'] ?? [],
                'intervention_suggestions' => $rec->openai_response_json['intervention_suggestions'] ?? [],
                'attached_materials' => $rec->openai_response_json['attached_materials'] ?? [],
                'learning_material_ids' => $rec->openai_response_json['learning_material_ids'] ?? [],
                'openai_response_json' => $rec->openai_response_json,
                'child' => $rec->child,
                'created_at' => $rec->created_at,
            ]);

        return response()->json($recommendations);
    }

    public function review(Request $request, AiRecommendation $aiRecommendation): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $aiRecommendation->child)) {
            abort(403);
        }

        if ($aiRecommendation->status !== 'pending_review') {
            return response()->json([
                'message' => 'This AI recommendation has already been reviewed and cannot be changed.',
            ], 422);
        }

        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'modified', 'rejected'])],
            'teacher_notes' => ['nullable', 'string'],
            'openai_response_json' => ['nullable', 'array'],
            'learning_material_ids' => ['nullable', 'array'],
            'learning_material_ids.*' => ['integer', 'exists:learning_materials,id'],
        ]);

        $recommendation = DB::transaction(function () use ($request, $aiRecommendation, $data) {
            $responseJson = $data['openai_response_json'] ?? $aiRecommendation->openai_response_json ?? [];
            if (! is_array($responseJson)) {
                $responseJson = [];
            }

            if (array_key_exists('learning_material_ids', $data)) {
                $ids = array_values(array_unique(array_map('intval', $data['learning_material_ids'] ?? [])));
                $materials = $ids === []
                    ? []
                    : \App\Models\LearningMaterial::query()
                        ->whereIn('id', $ids)
                        ->get(['id', 'title', 'type', 'description', 'tags', 'file_path'])
                        ->map(fn ($material) => [
                            'id' => $material->id,
                            'title' => $material->title,
                            'type' => $material->type,
                            'description' => $material->description,
                            'tags' => $material->tags ?? [],
                            'file_path' => $material->file_path,
                        ])
                        ->values()
                        ->all();

                $responseJson['attached_materials'] = $materials;
                $responseJson['learning_material_ids'] = array_column($materials, 'id');

                // Keep activity-based readers (child Learning Materials tab) in sync,
                // including removals when a teacher unchecks a suggested material.
                $allowedIds = array_fill_keys(array_map('intval', array_column($materials, 'id')), true);
                $activities = collect($responseJson['suggested_activities'] ?? [])
                    ->values()
                    ->map(function ($activity) use ($allowedIds) {
                        if (! is_array($activity)) {
                            return $activity;
                        }

                        $materialId = isset($activity['material_id']) ? (int) $activity['material_id'] : null;
                        if ($materialId && ! isset($allowedIds[$materialId])) {
                            // Drop teacher-only stubs entirely; clear AI activity links.
                            if (($activity['rationale'] ?? '') === 'Attached by teacher during AI review.') {
                                return null;
                            }
                            unset($activity['material_id']);
                        }

                        return $activity;
                    })
                    ->filter(fn ($activity) => $activity !== null)
                    ->values();

                $assigned = collect($materials)->pluck('id')->map(fn ($id) => (int) $id)->values();
                $activities = $activities->map(function ($activity, $index) use ($assigned) {
                    if (! is_array($activity)) {
                        return $activity;
                    }
                    if (empty($activity['material_id']) && $assigned->has($index)) {
                        $activity['material_id'] = $assigned[$index];
                    }

                    return $activity;
                });

                $covered = $activities
                    ->filter(fn ($a) => is_array($a) && ! empty($a['material_id']))
                    ->pluck('material_id')
                    ->map(fn ($id) => (int) $id)
                    ->all();
                foreach ($materials as $material) {
                    if (in_array((int) $material['id'], $covered, true)) {
                        continue;
                    }
                    $activities->push([
                        'title' => $material['title'],
                        'material_id' => $material['id'],
                        'rationale' => 'Attached by teacher during AI review.',
                    ]);
                    $covered[] = (int) $material['id'];
                }
                $responseJson['suggested_activities'] = $activities->values()->all();
            }

            $status = $data['status'];
            $originalJson = json_encode($aiRecommendation->openai_response_json ?? []);
            $nextJson = json_encode($responseJson);
            if (
                $status === 'approved'
                && (
                    array_key_exists('openai_response_json', $data)
                    || array_key_exists('learning_material_ids', $data)
                )
                && $nextJson !== $originalJson
            ) {
                $status = 'modified';
            }

            $aiRecommendation->update([
                'status' => $status,
                'teacher_notes' => $data['teacher_notes'] ?? null,
                'openai_response_json' => in_array($status, ['approved', 'modified'], true)
                    ? $responseJson
                    : $aiRecommendation->openai_response_json,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

            if (in_array($status, ['approved', 'modified'], true)) {
                $attachIds = array_map(
                    'intval',
                    $responseJson['learning_material_ids']
                        ?? collect($responseJson['attached_materials'] ?? [])->pluck('id')->all()
                );
                LearningMaterialController::attachToChild(
                    $aiRecommendation->child,
                    $attachIds,
                    $request->user()->id
                );
            }

            if (in_array($status, ['approved', 'modified'], true)) {
                $focusAreas = $responseJson['focus_areas'] ?? [];
                $title = count($focusAreas)
                    ? 'Therapy plan: '.implode(', ', array_slice($focusAreas, 0, 3))
                    : 'Learning support plan';

                $sessions = (int) ($responseJson['session_structure']['recommended_sessions_per_week'] ?? 2);
                if ($sessions < 1) {
                    $sessions = 2;
                }
                if ($sessions > 7) {
                    $sessions = 7;
                }

                $description = trim(implode("\n\n", array_filter([
                    $responseJson['developmental_summary'] ?? null,
                    isset($responseJson['clinical_basis']) ? 'Basis: '.$responseJson['clinical_basis'] : null,
                ])));

                TherapyPlan::create([
                    'child_id' => $aiRecommendation->child_id,
                    'teacher_id' => $request->user()->id,
                    'ai_recommendation_id' => $aiRecommendation->id,
                    'title' => $title,
                    'description' => $description ?: null,
                    'sessions_per_week' => $sessions,
                    'status' => 'active',
                ]);
            }

            return $aiRecommendation->fresh()->load(['child', 'assessment', 'reviewer', 'therapyPlan']);
        });

        return response()->json($recommendation);
    }
}
