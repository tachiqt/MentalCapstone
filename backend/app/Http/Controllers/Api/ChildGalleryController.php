<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Child;
use App\Models\ChildDocument;
use App\Models\GalleryAlbum;
use App\Models\ProgressPhoto;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ChildGalleryController extends Controller
{
    public const PER_PAGE = 20;

    public function albums(Request $request): JsonResponse
    {
        $children = ChildAccess::query($request->user())
            ->where('is_active', true)
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get(['id', 'first_name', 'last_name']);

        $auto = $children->map(function (Child $child) {
            $items = $this->collectItems($child->id);
            $cover = $items->first();

            return [
                'kind' => 'auto',
                'child_id' => $child->id,
                'first_name' => $child->first_name,
                'last_name' => $child->last_name,
                'name' => trim($child->first_name.' '.$child->last_name).' — All photos',
                'photo_count' => $items->count(),
                'cover' => $cover ? [
                    'download_path' => $cover['download_path'],
                    'mime_type' => $cover['mime_type'],
                    'source' => $cover['source'],
                    'id' => $cover['id'],
                ] : null,
            ];
        })->values();

        $custom = GalleryAlbum::query()
            ->withCount('photos')
            ->orderByDesc('updated_at')
            ->get()
            ->map(function (GalleryAlbum $album) {
                $coverPhoto = $album->photos()->orderByDesc('created_at')->first();

                return [
                    'id' => $album->id,
                    'kind' => 'custom',
                    'name' => $album->name,
                    'photo_count' => (int) $album->photos_count,
                    'cover' => $coverPhoto ? [
                        'download_path' => $coverPhoto->download_path,
                        'mime_type' => $coverPhoto->mime_type,
                        'source' => 'gallery_photo',
                        'id' => $coverPhoto->id,
                    ] : null,
                    'created_at' => optional($album->created_at)?->toIso8601String(),
                    'updated_at' => optional($album->updated_at)?->toIso8601String(),
                ];
            })
            ->values();

        return response()->json($custom->concat($auto)->values());
    }

    public function show(Request $request, int $child): JsonResponse
    {
        $record = ChildAccess::findOrFail($request->user(), $child);

        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(self::PER_PAGE, max(1, (int) $request->query('per_page', self::PER_PAGE)));

        $items = $this->collectItems($record->id);
        $total = $items->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $slice = $items->slice(($page - 1) * $perPage, $perPage)->values();

        return response()->json([
            'kind' => 'auto',
            'child' => [
                'id' => $record->id,
                'first_name' => $record->first_name,
                'last_name' => $record->last_name,
            ],
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
            'items' => $slice,
        ]);
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function collectItems(int $childId): Collection
    {
        $progress = ProgressPhoto::query()
            ->whereHas('progressRecord', fn ($q) => $q->where('child_id', $childId))
            ->with(['progressRecord:id,child_id,title,recorded_on'])
            ->orderByDesc('created_at')
            ->get()
            ->map(function (ProgressPhoto $photo) {
                return [
                    'id' => $photo->id,
                    'source' => 'progress_photo',
                    'download_path' => $photo->download_path,
                    'caption' => $photo->progressRecord?->title,
                    'recorded_on' => optional($photo->progressRecord?->recorded_on)?->toDateString(),
                    'created_at' => optional($photo->created_at)?->toIso8601String(),
                    'mime_type' => $photo->mime_type,
                    'original_filename' => $photo->original_filename,
                ];
            });

        $documents = ChildDocument::query()
            ->where('child_id', $childId)
            ->orderByDesc('created_at')
            ->get()
            ->filter(fn (ChildDocument $doc) => $this->isImageDocument($doc))
            ->map(function (ChildDocument $doc) {
                return [
                    'id' => $doc->id,
                    'source' => 'document',
                    'download_path' => $doc->download_path,
                    'caption' => $doc->title ?: $doc->original_filename,
                    'category' => $doc->category,
                    'recorded_on' => optional($doc->created_at)?->toDateString(),
                    'created_at' => optional($doc->created_at)?->toIso8601String(),
                    'mime_type' => $doc->mime_type,
                    'original_filename' => $doc->original_filename,
                ];
            })
            ->values();

        return $progress
            ->concat($documents)
            ->sortByDesc(fn (array $item) => $item['created_at'] ?? '')
            ->values();
    }

    private function isImageDocument(ChildDocument $doc): bool
    {
        $mime = strtolower((string) $doc->mime_type);
        if (str_starts_with($mime, 'image/')) {
            return true;
        }

        return (bool) preg_match('/\.(jpe?g|png)$/i', (string) $doc->original_filename);
    }
}
