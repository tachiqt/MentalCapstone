<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProgressPhoto;
use App\Models\ProgressRecord;
use App\Services\MediaStorage;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProgressController extends Controller
{
    public const MAX_PHOTOS = 6;

    private const PHOTO_RULES = [
        'image',
        'mimes:jpg,jpeg,png',
        'max:5120',
    ];

    public function __construct(private MediaStorage $media)
    {
    }

    public function all(Request $request): JsonResponse
    {
        $childIds = ChildAccess::query($request->user())->pluck('children.id');

        $records = ProgressRecord::with(['child', 'recorder', 'photos'])
            ->whereIn('child_id', $childIds)
            ->orderByDesc('recorded_on')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($records);
    }

    public function index(Request $request, int $child): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);

        $records = ProgressRecord::with(['recorder', 'photos'])
            ->where('child_id', $child)
            ->orderByDesc('recorded_on')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($records);
    }

    public function store(Request $request, int $child): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'summary' => ['nullable', 'string'],
            'milestone' => ['nullable', 'string', 'max:255'],
            'recorded_on' => ['nullable', 'date'],
            'photos' => ['nullable', 'array', 'max:'.self::MAX_PHOTOS],
            'photos.*' => array_merge(['file'], self::PHOTO_RULES),
        ]);

        $record = DB::transaction(function () use ($request, $child, $data) {
            $record = ProgressRecord::create([
                'title' => $data['title'],
                'summary' => $data['summary'] ?? null,
                'milestone' => $data['milestone'] ?? null,
                'recorded_on' => $data['recorded_on'] ?? now()->toDateString(),
                'child_id' => $child,
                'recorded_by' => $request->user()->id,
            ]);

            $this->attachPhotos($request, $record, 0);

            return $record;
        });

        return response()->json($record->load(['recorder', 'photos']), 201);
    }

    public function update(Request $request, int $child, ProgressRecord $progress): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);
        abort_unless((int) $progress->child_id === (int) $child, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'summary' => ['nullable', 'string'],
            'milestone' => ['nullable', 'string', 'max:255'],
            'recorded_on' => ['nullable', 'date'],
            'photos' => ['nullable', 'array', 'max:'.self::MAX_PHOTOS],
            'photos.*' => array_merge(['file'], self::PHOTO_RULES),
            'remove_photo_ids' => ['nullable', 'array'],
            'remove_photo_ids.*' => ['integer'],
        ]);

        $record = DB::transaction(function () use ($request, $progress, $data) {
            $payload = [];
            foreach (['title', 'summary', 'milestone', 'recorded_on'] as $field) {
                if (array_key_exists($field, $data)) {
                    $payload[$field] = $data[$field];
                }
            }
            if ($payload !== []) {
                $progress->update($payload);
            }

            $removeIds = array_values(array_unique(array_map('intval', $data['remove_photo_ids'] ?? [])));
            if ($removeIds !== []) {
                $toRemove = $progress->photos()->whereIn('id', $removeIds)->get();
                foreach ($toRemove as $photo) {
                    $this->media->deletePrivate($photo->file_path, $photo->disk);
                    $photo->delete();
                }
            }

            $existingCount = $progress->photos()->count();
            $newFiles = $request->file('photos', []);
            if (! is_array($newFiles)) {
                $newFiles = $newFiles ? [$newFiles] : [];
            }
            if ($existingCount + count($newFiles) > self::MAX_PHOTOS) {
                abort(422, 'A progress update may include at most '.self::MAX_PHOTOS.' photos.');
            }

            $this->attachPhotos($request, $progress, $existingCount);

            return $progress;
        });

        return response()->json($record->fresh()->load(['recorder', 'photos']));
    }

    public function downloadPhoto(Request $request, ProgressPhoto $photo): StreamedResponse
    {
        $photo->loadMissing('progressRecord');
        abort_unless($photo->progressRecord, 404);
        ChildAccess::findOrFail($request->user(), (int) $photo->progressRecord->child_id);

        return $this->media->streamPrivate(
            $photo->file_path,
            $photo->original_filename,
            $photo->disk,
            $photo->mime_type
        );
    }

    private function attachPhotos(Request $request, ProgressRecord $record, int $startOrder): void
    {
        $files = $request->file('photos', []);
        if (! is_array($files)) {
            $files = $files ? [$files] : [];
        }

        $order = $startOrder;
        foreach ($files as $file) {
            if (! $file) {
                continue;
            }
            $stored = $this->media->storePrivate($file, 'progress-photos/'.$record->id);
            ProgressPhoto::create([
                'progress_record_id' => $record->id,
                'uploaded_by' => $request->user()->id,
                'original_filename' => $file->getClientOriginalName() ?: basename($stored['path']),
                'mime_type' => $file->getMimeType(),
                'size_bytes' => $file->getSize() ?: 0,
                'disk' => $stored['disk'],
                'file_path' => $stored['path'],
                'sort_order' => $order++,
            ]);
        }
    }
}
