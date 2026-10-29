<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AssessmentChecklist;
use App\Services\OpenAIChecklistService;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class ChecklistController extends Controller
{
    public function __construct(
        private OpenAIChecklistService $checklistService
    ) {}

    public function index(): JsonResponse
    {
        $checklists = QueryCache::remember(QueryCache::CHECKLISTS, 300, function () {
            return AssessmentChecklist::query()
                ->withCount('items')
                ->orderByDesc('created_at')
                ->get();
        });

        return response()->json($checklists);
    }

    public function suggest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:64'],
            'age_band' => ['nullable', 'string', 'max:32'],
            'diagnosis_focus' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string', 'max:2000'],
            'item_count' => ['nullable', 'integer', 'min:4', 'max:16'],
        ]);

        try {
            $draft = $this->checklistService->suggest($data);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'AI checklist suggestion failed. '.$e->getMessage(),
            ], 502);
        }

        return response()->json($draft);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.prompt' => ['required', 'string', 'max:255'],
            'items.*.domain' => ['nullable', 'string', 'max:255'],
            'items.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $checklist = DB::transaction(function () use ($request, $data) {
            $checklist = AssessmentChecklist::create([
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'created_by' => $request->user()->id,
                'is_active' => $data['is_active'] ?? true,
            ]);

            foreach ($data['items'] as $index => $item) {
                $checklist->items()->create([
                    'prompt' => $item['prompt'],
                    'domain' => $item['domain'] ?? null,
                    'sort_order' => $item['sort_order'] ?? $index,
                ]);
            }

            return $checklist->load('items');
        });

        QueryCache::forget(QueryCache::CHECKLISTS);

        return response()->json($checklist, 201);
    }

    public function show(AssessmentChecklist $assessmentChecklist): JsonResponse
    {
        $assessmentChecklist->load('items');

        return response()->json($assessmentChecklist);
    }

    public function update(Request $request, AssessmentChecklist $assessmentChecklist): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.prompt' => ['required_with:items', 'string', 'max:255'],
            'items.*.domain' => ['nullable', 'string', 'max:255'],
            'items.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($assessmentChecklist, $data) {
            $assessmentChecklist->update(collect($data)->except('items')->all());

            if (isset($data['items'])) {
                $assessmentChecklist->items()->delete();

                foreach ($data['items'] as $index => $item) {
                    $assessmentChecklist->items()->create([
                        'prompt' => $item['prompt'],
                        'domain' => $item['domain'] ?? null,
                        'sort_order' => $item['sort_order'] ?? $index,
                    ]);
                }
            }
        });

        QueryCache::forget(QueryCache::CHECKLISTS);

        return response()->json($assessmentChecklist->fresh()->load('items'));
    }

    public function destroy(AssessmentChecklist $assessmentChecklist): JsonResponse
    {
        $assessmentChecklist->delete();

        QueryCache::forget(QueryCache::CHECKLISTS);

        return response()->json(['message' => 'Checklist deleted.']);
    }
}
