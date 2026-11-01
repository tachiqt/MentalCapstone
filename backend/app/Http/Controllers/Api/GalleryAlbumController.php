<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GalleryAlbum;
use App\Models\GalleryPhoto;
use App\Services\MediaStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GalleryAlbumController extends Controller
{
    public const PER_PAGE = 20;

    public const MAX_PHOTOS_PER_REQUEST = 12;

    public function __construct(private MediaStorage $media) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $album = GalleryAlbum::create([
            'child_id' => null,
            'created_by' => $request->user()->id,
            'name' => trim($data['name']),
        ]);

        return response()->json($this->albumPayload($album), 201);
    }

    public function update(Request $request, GalleryAlbum $album): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $album->update(['name' => trim($data['name'])]);

        return response()->json($this->albumPayload($album->fresh()));
    }

    public function destroy(Request $request, GalleryAlbum $album): JsonResponse
    {
        DB::transaction(function () use ($album) {
            $album->load('photos');
            foreach ($album->photos as $photo) {
                $this->media->deletePrivate($photo->file_path, $photo->disk);
            }
            $album->delete();
        });

        return response()->json(['message' => 'Album deleted.']);
    }

    public function photos(Request $request, GalleryAlbum $album): JsonResponse
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(self::PER_PAGE, max(1, (int) $request->query('per_page', self::PER_PAGE)));

        $query = $album->photos()->orderByDesc('created_at')->orderByDesc('id');
        $total = (clone $query)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $items = $query
            ->skip(($page - 1) * $perPage)
            ->take($perPage)
            ->get()
            ->map(fn (GalleryPhoto $photo) => $this->photoPayload($photo))
            ->values();

        return response()->json([
            'album' => $this->albumPayload($album),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
            'items' => $items,
        ]);
    }

    public function uploadPhotos(Request $request, GalleryAlbum $album): JsonResponse
    {
        $request->validate([
            'photos' => ['required', 'array', 'min:1', 'max:'.self::MAX_PHOTOS_PER_REQUEST],
            'photos.*' => ['required', 'file', 'mimes:jpg,jpeg,png', 'max:5120'],
        ]);

        $files = $request->file('photos', []);
        if (! is_array($files)) {
            $files = $files ? [$files] : [];
        }

        $startOrder = (int) $album->photos()->max('sort_order');
        $created = [];
        $order = $startOrder + 1;

        foreach ($files as $file) {
            if (! $file) {
                continue;
            }
            $stored = $this->media->storePrivate($file, 'gallery-photos/'.$album->id);
            $photo = GalleryPhoto::create([
                'gallery_album_id' => $album->id,
                'uploaded_by' => $request->user()->id,
                'original_filename' => $file->getClientOriginalName() ?: basename($stored['path']),
                'mime_type' => $file->getMimeType(),
                'size_bytes' => $file->getSize() ?: 0,
                'disk' => $stored['disk'],
                'file_path' => $stored['path'],
                'sort_order' => $order++,
            ]);
            $created[] = $this->photoPayload($photo);
        }

        $album->touch();

        return response()->json([
            'album' => $this->albumPayload($album->fresh()),
            'items' => $created,
        ], 201);
    }

    public function downloadPhoto(Request $request, GalleryPhoto $photo): StreamedResponse
    {
        $photo->loadMissing('album');
        abort_unless($photo->album, 404);

        return $this->media->streamPrivate(
            $photo->file_path,
            $photo->original_filename ?: 'photo.jpg',
            $photo->disk,
            $photo->mime_type
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function albumPayload(GalleryAlbum $album): array
    {
        $cover = $album->relationLoaded('photos')
            ? $album->photos->sortByDesc('created_at')->first()
            : $album->photos()->orderByDesc('created_at')->first();

        return [
            'id' => $album->id,
            'kind' => 'custom',
            'name' => $album->name,
            'photo_count' => $album->photos()->count(),
            'cover' => $cover ? [
                'download_path' => $cover->download_path,
                'mime_type' => $cover->mime_type,
                'source' => 'gallery_photo',
                'id' => $cover->id,
            ] : null,
            'created_at' => optional($album->created_at)?->toIso8601String(),
            'updated_at' => optional($album->updated_at)?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function photoPayload(GalleryPhoto $photo): array
    {
        return [
            'id' => $photo->id,
            'source' => 'gallery_photo',
            'download_path' => $photo->download_path,
            'caption' => $photo->original_filename,
            'recorded_on' => optional($photo->created_at)?->toDateString(),
            'created_at' => optional($photo->created_at)?->toIso8601String(),
            'mime_type' => $photo->mime_type,
            'original_filename' => $photo->original_filename,
        ];
    }
}
