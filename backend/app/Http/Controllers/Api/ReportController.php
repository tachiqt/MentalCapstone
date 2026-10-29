<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
use App\Models\Child;
use App\Models\MedicationLog;
use App\Models\TherapySession;
use App\Models\User;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use App\Http\Controllers\Controller;

class ReportController extends Controller
{
    public function facility(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $hasPeriod = isset($validated['from']) || isset($validated['to']);
        $from = isset($validated['from'])
            ? \Illuminate\Support\Carbon::parse($validated['from'])->startOfDay()
            : null;
        $to = isset($validated['to'])
            ? \Illuminate\Support\Carbon::parse($validated['to'])->endOfDay()
            : null;

        $usersByRole = User::query()
            ->select('role', DB::raw('count(*) as count'))
            ->groupBy('role')
            ->pluck('count', 'role');

        $roleCounts = [];
        foreach (UserRole::cases() as $role) {
            $roleCounts[$role->value] = (int) ($usersByRole[$role->value] ?? 0);
        }

        $recommendationQuery = AiRecommendation::query();
        if ($from) {
            $recommendationQuery->where('created_at', '>=', $from);
        }
        if ($to) {
            $recommendationQuery->where('created_at', '<=', $to);
        }
        $recommendationCounts = (clone $recommendationQuery)
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $sessionQuery = TherapySession::query();
        if ($from) {
            $sessionQuery->where('scheduled_at', '>=', $from);
        }
        if ($to) {
            $sessionQuery->where('scheduled_at', '<=', $to);
        }
        $sessionCounts = (clone $sessionQuery)
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $completedInPeriodStart = $from ?: $monthStart;
        $completedInPeriodEnd = $to ?: $monthEnd;

        $upcomingSessionsQuery = TherapySession::query()
            ->with([
                'child:id,first_name,last_name',
                'teacher:id,name',
                'therapyPlan:id,title',
            ])
            ->where('status', '!=', 'cancelled');

        if ($hasPeriod) {
            if ($from) {
                $upcomingSessionsQuery->where('scheduled_at', '>=', $from);
            }
            if ($to) {
                $upcomingSessionsQuery->where('scheduled_at', '<=', $to);
            }
        } else {
            $upcomingSessionsQuery->where('scheduled_at', '>=', now()->subHour());
        }

        $upcomingSessions = $upcomingSessionsQuery
            ->orderBy('scheduled_at')
            ->limit(6)
            ->get(['id', 'child_id', 'teacher_id', 'therapy_plan_id', 'scheduled_at', 'status', 'observations', 'outcomes']);

        $assessmentsQuery = Assessment::query();
        if ($from) {
            $assessmentsQuery->where('created_at', '>=', $from);
        }
        if ($to) {
            $assessmentsQuery->where('created_at', '<=', $to);
        }

        $scheduledUpcomingQuery = TherapySession::where('status', 'scheduled')
            ->where('scheduled_at', '>=', now());
        if ($from) {
            $scheduledUpcomingQuery->where('scheduled_at', '>=', $from);
        }
        if ($to) {
            $scheduledUpcomingQuery->where('scheduled_at', '<=', $to);
        }

        return response()->json([
            'period' => $hasPeriod ? [
                'from' => ($from ?: $to?->copy()->startOfDay())?->toDateString(),
                'to' => ($to ?: $from?->copy()->endOfDay())?->toDateString(),
            ] : null,
            'users_by_role' => $roleCounts,
            'staff_total' => array_sum($roleCounts),
            'children_count' => Child::count(),
            'children_active' => Child::where('is_active', true)->count(),
            'pending_recommendations' => (int) ($recommendationCounts['pending_review'] ?? 0),
            'recommendations_by_status' => [
                'pending_review' => (int) ($recommendationCounts['pending_review'] ?? 0),
                'approved' => (int) ($recommendationCounts['approved'] ?? 0),
                'modified' => (int) ($recommendationCounts['modified'] ?? 0),
                'rejected' => (int) ($recommendationCounts['rejected'] ?? 0),
            ],
            'sessions_completed_this_month' => TherapySession::where('status', 'completed')
                ->whereBetween('scheduled_at', [$completedInPeriodStart, $completedInPeriodEnd])
                ->count(),
            'sessions_scheduled_upcoming' => $scheduledUpcomingQuery->count(),
            'sessions_today' => TherapySession::where('status', 'scheduled')
                ->whereDate('scheduled_at', now()->toDateString())
                ->count(),
            'sessions_by_status' => [
                'scheduled' => (int) ($sessionCounts['scheduled'] ?? 0),
                'completed' => (int) ($sessionCounts['completed'] ?? 0),
                'cancelled' => (int) ($sessionCounts['cancelled'] ?? 0),
            ],
            'assessments_total' => $assessmentsQuery->count(),
            'checklists_total' => AssessmentChecklist::where('is_active', true)->count(),
            'upcoming_sessions' => $upcomingSessions,
        ]);
    }

    public function medicationReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', Rule::in(['weekly', 'monthly'])],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $period = $validated['period'] ?? null;
        $from = isset($validated['from'])
            ? \Illuminate\Support\Carbon::parse($validated['from'])->startOfDay()
            : null;
        $to = isset($validated['to'])
            ? \Illuminate\Support\Carbon::parse($validated['to'])->endOfDay()
            : null;

        if ($from || $to) {
            $from = $from ?: $to->copy()->startOfDay();
            $to = $to ?: $from->copy()->endOfDay();
        } elseif ($period === 'weekly') {
            $from = now()->startOfWeek();
            $to = now()->endOfDay();
        } elseif ($period === 'monthly') {
            $from = now()->startOfMonth();
            $to = now()->endOfDay();
        } else {
            $from = now()->startOfMonth();
            $to = now()->endOfDay();
            $period = $period ?: 'monthly';
        }

        $logs = MedicationLog::query()
            ->with([
                'child:id,first_name,last_name',
                'schedule:id,medicine_name,dosage',
                'caretaker:id,name',
            ])
            ->whereBetween('administered_at', [$from, $to])
            ->orderByDesc('administered_at')
            ->get();

        $statuses = ['given', 'missed', 'refused', 'partial'];
        $dosesByStatus = [];
        foreach ($statuses as $status) {
            $dosesByStatus[$status] = $logs->where('status', $status)->count();
        }

        $childrenGivenCount = $logs
            ->where('status', 'given')
            ->pluck('child_id')
            ->unique()
            ->count();

        $rows = $logs->map(function (MedicationLog $log) {
            $child = $log->child;

            return [
                'child' => $child ? [
                    'id' => $child->id,
                    'first_name' => $child->first_name,
                    'last_name' => $child->last_name,
                ] : null,
                'medicine' => $log->schedule?->medicine_name,
                'dosage' => $log->schedule?->dosage,
                'administered_at' => $log->administered_at,
                'status' => $log->status,
                'caretaker' => $log->caretaker?->name,
            ];
        })->values();

        return response()->json([
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'preset' => $period,
            ],
            'summary' => [
                'children_given_count' => $childrenGivenCount,
                'doses_by_status' => $dosesByStatus,
                'total_logs' => $logs->count(),
            ],
            'rows' => $rows,
        ]);
    }

    public function psychometricianSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $user->role instanceof UserRole ? $user->role : UserRole::tryFrom((string) $user->role);
        if ($role !== UserRole::Psychometrician) {
            abort(403, 'This summary is available to psychometricians only.');
        }

        $weekStart = now()->startOfWeek();
        $mine = Assessment::query()->where('psychometrician_id', $user->id);

        $assessmentIds = (clone $mine)->pluck('id');
        $withActiveRec = AiRecommendation::query()
            ->whereIn('assessment_id', $assessmentIds)
            ->whereIn('status', ['pending_review', 'approved', 'modified'])
            ->pluck('assessment_id')
            ->unique();

        $pendingAiGeneration = (clone $mine)
            ->whereNotIn('id', $withActiveRec)
            ->count();

        $awaitingTeacherReview = AiRecommendation::query()
            ->whereIn('assessment_id', $assessmentIds)
            ->where('status', 'pending_review')
            ->count();

        $recentAssessments = (clone $mine)
            ->with([
                'child:id,first_name,last_name',
                'checklist:id,title',
                'aiRecommendations' => fn ($q) => $q
                    ->where('status', '!=', 'rejected')
                    ->latest()
                    ->limit(1)
                    ->select(['id', 'assessment_id', 'status', 'created_at']),
            ])
            ->orderByDesc('created_at')
            ->limit(5)
            ->get(['id', 'child_id', 'assessment_checklist_id', 'severity_level', 'created_at']);

        return response()->json([
            'assessments_submitted_total' => (clone $mine)->count(),
            'assessments_this_week' => (clone $mine)->where('created_at', '>=', $weekStart)->count(),
            'pending_ai_generation' => $pendingAiGeneration,
            'awaiting_teacher_review' => $awaitingTeacherReview,
            'children_active' => Child::where('is_active', true)->count(),
            'checklists_active' => AssessmentChecklist::where('is_active', true)->count(),
            'recent_assessments' => $recentAssessments,
        ]);
    }

    public function childReport(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $child->load(['users:id,name,username,role']);

        $assessments = $child->assessments()
            ->with([
                'checklist:id,title',
                'psychometrician:id,name,username',
                'responses.checklistItem:id,domain,prompt,sort_order',
                'aiRecommendations' => fn ($q) => $q->where('status', '!=', 'rejected')->latest()->limit(3),
            ])
            ->withCount([
                'responses',
                'responses as scored_responses_count' => fn ($q) => $q
                    ->whereNotNull('score')
                    ->where('score', '!=', ''),
            ])
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        // Oldest → newest for performance trend charts on the profile.
        $performanceTrend = $assessments
            ->sortBy('created_at')
            ->values()
            ->map(function ($assessment) {
                $scores = $assessment->responses
                    ->map(fn ($r) => is_numeric($r->score) ? (float) $r->score : null)
                    ->filter(fn ($score) => $score !== null)
                    ->values();

                $domains = [];
                foreach ($assessment->responses as $response) {
                    if (! is_numeric($response->score)) {
                        continue;
                    }
                    $domain = $response->checklistItem?->domain ?: 'General';
                    $domains[$domain] ??= ['sum' => 0, 'count' => 0];
                    $domains[$domain]['sum'] += (float) $response->score;
                    $domains[$domain]['count']++;
                }

                return [
                    'assessment_id' => $assessment->id,
                    'title' => $assessment->checklist?->title,
                    'severity_level' => $assessment->severity_level,
                    'submitted_at' => $assessment->created_at,
                    'average_score' => $scores->count() ? round($scores->avg(), 2) : null,
                    'scored_count' => $scores->count(),
                    'item_count' => $assessment->responses->count(),
                    'domain_averages' => collect($domains)->map(fn ($row, $domain) => [
                        'domain' => $domain,
                        'average' => round($row['sum'] / max(1, $row['count']), 2),
                        'count' => $row['count'],
                    ])->values(),
                ];
            })
            ->values();

        $domainRollup = [];
        foreach ($performanceTrend as $point) {
            foreach ($point['domain_averages'] as $domainRow) {
                $key = $domainRow['domain'];
                $domainRollup[$key] ??= ['sum' => 0, 'weight' => 0];
                $domainRollup[$key]['sum'] += $domainRow['average'] * $domainRow['count'];
                $domainRollup[$key]['weight'] += $domainRow['count'];
            }
        }
        $domainPerformance = collect($domainRollup)
            ->map(fn ($row, $domain) => [
                'domain' => $domain,
                'average' => $row['weight'] ? round($row['sum'] / $row['weight'], 2) : 0,
                'count' => $row['weight'],
            ])
            ->sortByDesc('average')
            ->values();

        $recommendations = $child->aiRecommendations()
            ->where('status', '!=', 'rejected')
            ->with([
                'assessment:id,assessment_checklist_id,severity_level,created_at',
                'assessment.checklist:id,title',
                'reviewer:id,name,username',
                'therapyPlan:id,ai_recommendation_id,title,status',
            ])
            ->orderByDesc('created_at')
            ->limit(30)
            ->get();

        $medicationSchedules = $child->medicationSchedules()
            ->with('creator:id,name')
            ->orderByDesc('created_at')
            ->get();

        $materialIds = collect($recommendations)
            ->flatMap(function ($rec) {
                $json = is_array($rec->openai_response_json) ? $rec->openai_response_json : [];
                $fromActivities = collect($json['suggested_activities'] ?? [])->pluck('material_id');
                $fromAttached = collect($json['attached_materials'] ?? [])->pluck('id');
                $fromIds = collect($json['learning_material_ids'] ?? []);

                return $fromActivities->merge($fromAttached)->merge($fromIds)->filter();
            })
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        $childScopedIds = \App\Models\LearningMaterial::query()
            ->where('child_id', $child->id)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $materialIds = array_values(array_unique(array_merge($materialIds, $childScopedIds)));

        $recommendedMaterials = $materialIds
            ? \App\Models\LearningMaterial::query()
                ->whereIn('id', $materialIds)
                ->orderBy('title')
                ->get(['id', 'title', 'description', 'type', 'tags', 'child_id', 'created_at'])
            : collect();

        $parentFeedback = $child->parentFeedback()
            ->with('parent:id,name,username')
            ->orderByDesc('created_at')
            ->limit(30)
            ->get();

        return response()->json([
            'child' => $child,
            'assessments_count' => $child->assessments()->count(),
            'latest_assessment' => $assessments->first(),
            'assessments' => $assessments,
            'performance_trend' => $performanceTrend,
            'domain_performance' => $domainPerformance,
            'recommendations' => $recommendations,
            'pending_recommendations_count' => $recommendations->where('status', 'pending_review')->count(),
            'active_therapy_plans' => $child->therapyPlans()->where('status', 'active')->with('teacher:id,name')->get(),
            'sessions_completed' => $child->therapySessions()->where('status', 'completed')->count(),
            'sessions_upcoming' => $child->therapySessions()
                ->with('teacher:id,name')
                ->where('scheduled_at', '>=', now())
                ->where('status', 'scheduled')
                ->orderBy('scheduled_at')
                ->limit(8)
                ->get(),
            'progress_records' => $child->progressRecords()->with('recorder:id,name,username,role')->latest()->limit(15)->get(),
            'parent_feedback' => $parentFeedback,
            'medication_schedules' => $medicationSchedules,
            'medication_schedules_active' => $medicationSchedules->where('is_active', true)->count(),
            'recommended_materials' => $recommendedMaterials,
            // Child Learning Materials pane shows only assigned/recommended items.
            'learning_materials' => $recommendedMaterials,
        ]);
    }
}
