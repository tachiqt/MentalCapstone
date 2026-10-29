<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiRecommendation;
use App\Models\Child;
use App\Models\LearningMaterial;
use App\Services\MediaStorage;
use App\Support\ChildAccess;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LearningMaterialController extends Controller
{
    private const TYPES = ['worksheet', 'visual', 'video', 'audio', 'activity', 'guide'];

    private const FILE_RULES = [
        'nullable',
        'file',
        'max:10240',
        'mimes:pdf,jpg,jpeg,png,gif,webp,mp3,wav,mp4,webm,doc,docx',
    ];

    public function __construct(private MediaStorage $media)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $childId = $request->filled('child_id') ? (int) $request->input('child_id') : null;

        if ($childId) {
            $child = ChildAccess::findOrFail($request->user(), $childId);
            $materials = $this->materialsForChild($child);

            return response()->json($materials);
        }

        $materials = QueryCache::remember(QueryCache::MATERIALS, 300, function () {
            return LearningMaterial::with('uploader:id,name,username')
                ->orderByDesc('created_at')
                ->get();
        });

        return response()->json($materials);
    }

    /**
     * Replace the child's assigned learning-material set.
     * Unassign removes the child link only — library rows are never deleted.
     */
    public function syncForChild(Request $request, Child $child): JsonResponse
    {
        if (! ChildAccess::canAccess($request->user(), $child)) {
            abort(403);
        }

        $data = $request->validate([
            'learning_material_ids' => ['present', 'array'],
            'learning_material_ids.*' => ['integer', 'exists:learning_materials,id'],
        ]);

        $desired = array_values(array_unique(array_map('intval', $data['learning_material_ids'])));

        DB::transaction(function () use ($request, $child, $desired) {
            $syncPayload = [];
            foreach ($desired as $materialId) {
                $syncPayload[$materialId] = ['assigned_by' => $request->user()->id];
            }
            $child->learningMaterials()->sync($syncPayload);

            // Legacy direct child_id links: keep only those still desired.
            LearningMaterial::query()
                ->where('child_id', $child->id)
                ->whereNotIn('id', $desired === [] ? [0] : $desired)
                ->update(['child_id' => null]);

            // Hide recommendation-sourced materials the teacher removed so they
            // do not reappear on the next index until re-added from the library.
            $recommendationIds = $this->recommendationMaterialIds($child->id);
            $toHide = array_values(array_diff($recommendationIds, $desired));

            DB::table('child_learning_material_hidden')
                ->where('child_id', $child->id)
                ->delete();

            if ($toHide !== []) {
                $now = now();
                DB::table('child_learning_material_hidden')->insert(
                    array_map(fn (int $id) => [
                        'child_id' => $child->id,
                        'learning_material_id' => $id,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ], $toHide)
                );
            }

            // Re-adding from library clears any prior hide for those IDs (already wiped above).
        });

        QueryCache::forget(QueryCache::MATERIALS);

        return response()->json($this->materialsForChild($child->fresh()));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedPayload($request);

        if (! empty($data['child_id'])) {
            ChildAccess::findOrFail($request->user(), (int) $data['child_id']);
        }

        $filePath = null;
        if ($request->hasFile('file')) {
            $filePath = $this->media->store($request->file('file'), 'learning-materials');
        }

        $material = LearningMaterial::create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'type' => $data['type'] ?? null,
            'tags' => $data['tags'] ?? [],
            'file_path' => $filePath,
            'uploaded_by' => $request->user()->id,
            'child_id' => $data['child_id'] ?? null,
        ]);

        if (! empty($data['child_id'])) {
            $child = Child::query()->find((int) $data['child_id']);
            if ($child) {
                $child->learningMaterials()->syncWithoutDetaching([
                    $material->id => ['assigned_by' => $request->user()->id],
                ]);
                DB::table('child_learning_material_hidden')
                    ->where('child_id', $child->id)
                    ->where('learning_material_id', $material->id)
                    ->delete();
            }
        }

        QueryCache::forget(QueryCache::MATERIALS);

        return response()->json($material->load('uploader:id,name,username'), 201);
    }

    public function show(LearningMaterial $learningMaterial): JsonResponse
    {
        return response()->json($learningMaterial->load('uploader:id,name,username'));
    }

    public function update(Request $request, LearningMaterial $learningMaterial): JsonResponse
    {
        $data = $this->validatedPayload($request);

        $payload = [
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'type' => $data['type'] ?? null,
            'tags' => $data['tags'] ?? [],
        ];

        if (array_key_exists('child_id', $data)) {
            if (! empty($data['child_id'])) {
                ChildAccess::findOrFail($request->user(), (int) $data['child_id']);
            }
            $payload['child_id'] = $data['child_id'] ?? null;
        }

        if ($request->hasFile('file')) {
            $payload['file_path'] = $this->media->store(
                $request->file('file'),
                'learning-materials',
                $learningMaterial->file_path
            );
        }

        $learningMaterial->update($payload);

        if (array_key_exists('child_id', $data) && ! empty($data['child_id'])) {
            $child = Child::query()->find((int) $data['child_id']);
            if ($child) {
                $child->learningMaterials()->syncWithoutDetaching([
                    $learningMaterial->id => ['assigned_by' => $request->user()->id],
                ]);
            }
        }

        QueryCache::forget(QueryCache::MATERIALS);

        return response()->json($learningMaterial->fresh()->load('uploader:id,name,username'));
    }

    public function destroy(LearningMaterial $learningMaterial): JsonResponse
    {
        if ($learningMaterial->file_path) {
            $this->media->delete($learningMaterial->file_path);
        }
        $learningMaterial->delete();
        QueryCache::forget(QueryCache::MATERIALS);

        return response()->json(['ok' => true]);
    }

    /**
     * @return list<int>
     */
    public static function recommendationMaterialIdsFor(int $childId): array
    {
        return AiRecommendation::query()
            ->where('child_id', $childId)
            ->where('status', '!=', 'rejected')
            ->get(['openai_response_json'])
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
    }

    /**
     * Attach library materials to a child without removing other assignments.
     *
     * @param  list<int>  $materialIds
     */
    public static function attachToChild(Child $child, array $materialIds, ?int $assignedBy = null): void
    {
        $ids = array_values(array_unique(array_map('intval', $materialIds)));
        if ($ids === []) {
            return;
        }

        $payload = [];
        foreach ($ids as $id) {
            $payload[$id] = ['assigned_by' => $assignedBy];
        }
        $child->learningMaterials()->syncWithoutDetaching($payload);

        DB::table('child_learning_material_hidden')
            ->where('child_id', $child->id)
            ->whereIn('learning_material_id', $ids)
            ->delete();
    }

    private function materialsForChild(Child $child)
    {
        $recommendationIds = $this->recommendationMaterialIds($child->id);
        $pivotIds = $child->learningMaterials()->pluck('learning_materials.id')->map(fn ($id) => (int) $id)->all();
        $hiddenIds = DB::table('child_learning_material_hidden')
            ->where('child_id', $child->id)
            ->pluck('learning_material_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $visibleRecommendationIds = array_values(array_diff($recommendationIds, $hiddenIds));

        return LearningMaterial::with('uploader:id,name,username')
            ->where(function ($query) use ($child, $pivotIds, $visibleRecommendationIds) {
                $query->where('child_id', $child->id);
                if ($pivotIds !== []) {
                    $query->orWhereIn('id', $pivotIds);
                }
                if ($visibleRecommendationIds !== []) {
                    $query->orWhereIn('id', $visibleRecommendationIds);
                }
            })
            ->orderByDesc('created_at')
            ->get()
            ->unique('id')
            ->values();
    }

    /**
     * @return list<int>
     */
    private function recommendationMaterialIds(int $childId): array
    {
        return self::recommendationMaterialIdsFor($childId);
    }

    private function validatedPayload(Request $request): array
    {
        $request->merge([
            'tags' => $this->normalizeTags($request),
            'type' => $request->input('type') ?: null,
        ]);

        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'type' => ['nullable', 'string', 'max:32', Rule::in(self::TYPES)],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:64'],
            'child_id' => ['nullable', 'integer', 'exists:children,id'],
            'file' => self::FILE_RULES,
        ]);
    }

    private function normalizeTags(Request $request): array
    {
        $tags = $request->input('tags', []);

        if (is_string($tags)) {
            $decoded = json_decode($tags, true);
            $tags = is_array($decoded)
                ? $decoded
                : array_map('trim', explode(',', $tags));
        }

        if (! is_array($tags)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(
            static fn ($tag) => is_string($tag) ? trim($tag) : '',
            $tags
        ))));
    }
}
