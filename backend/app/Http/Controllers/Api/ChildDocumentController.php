<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChildDocument;
use App\Services\MediaStorage;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChildDocumentController extends Controller
{
    private const FILE_RULES = [
        'required',
        'file',
        'mimes:jpg,jpeg,png,pdf',
        'max:10240',
    ];

    public function __construct(private MediaStorage $media)
    {
    }

    public function index(Request $request, int $child): JsonResponse
    {
        $record = ChildAccess::findOrFail($request->user(), $child);

        $documents = ChildDocument::with('uploader:id,name,username')
            ->where('child_id', $record->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($documents);
    }

    public function store(Request $request, int $child): JsonResponse
    {
        $record = ChildAccess::findOrFail($request->user(), $child);

        $data = $request->validate([
            'category' => ['required', 'string', Rule::in(ChildDocument::CATEGORIES)],
            'title' => ['nullable', 'string', 'max:255'],
            'file' => self::FILE_RULES,
        ]);

        $file = $request->file('file');
        $stored = $this->media->storePrivate($file, 'child-documents/'.$record->id);

        $document = ChildDocument::create([
            'child_id' => $record->id,
            'uploaded_by' => $request->user()->id,
            'category' => $data['category'],
            'title' => $data['title'] ?? null,
            'original_filename' => $file->getClientOriginalName() ?: basename($stored['path']),
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize() ?: 0,
            'disk' => $stored['disk'],
            'file_path' => $stored['path'],
        ]);

        return response()->json($document->load('uploader:id,name,username'), 201);
    }

    public function show(Request $request, int $child, ChildDocument $document): JsonResponse
    {
        $this->assertDocumentBelongs($request, $child, $document);

        return response()->json($document->load('uploader:id,name,username'));
    }

    public function update(Request $request, int $child, ChildDocument $document): JsonResponse
    {
        $this->assertDocumentBelongs($request, $child, $document);

        $data = $request->validate([
            'category' => ['sometimes', 'string', Rule::in(ChildDocument::CATEGORIES)],
            'title' => ['nullable', 'string', 'max:255'],
            'file' => ['sometimes', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        $payload = [];
        if (array_key_exists('category', $data)) {
            $payload['category'] = $data['category'];
        }
        if (array_key_exists('title', $data)) {
            $payload['title'] = $data['title'];
        }

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $stored = $this->media->storePrivate(
                $file,
                'child-documents/'.$document->child_id,
                $document->file_path,
                $document->disk
            );
            $payload['original_filename'] = $file->getClientOriginalName() ?: basename($stored['path']);
            $payload['mime_type'] = $file->getMimeType();
            $payload['size_bytes'] = $file->getSize() ?: 0;
            $payload['disk'] = $stored['disk'];
            $payload['file_path'] = $stored['path'];
            $payload['uploaded_by'] = $request->user()->id;
        }

        $document->update($payload);

        return response()->json($document->fresh()->load('uploader:id,name,username'));
    }

    public function destroy(Request $request, int $child, ChildDocument $document): JsonResponse
    {
        $this->assertDocumentBelongs($request, $child, $document);

        $this->media->deletePrivate($document->file_path, $document->disk);
        $document->delete();

        return response()->json(['ok' => true]);
    }

    public function file(Request $request, int $child, ChildDocument $document): StreamedResponse
    {
        $this->assertDocumentBelongs($request, $child, $document);

        return $this->media->streamPrivate(
            $document->file_path,
            $document->original_filename,
            $document->disk,
            $document->mime_type
        );
    }

    private function assertDocumentBelongs(Request $request, int $child, ChildDocument $document): void
    {
        ChildAccess::findOrFail($request->user(), $child);
        abort_unless((int) $document->child_id === (int) $child, 404);
    }
}
