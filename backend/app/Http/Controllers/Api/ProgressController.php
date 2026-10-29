<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProgressRecord;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProgressController extends Controller
{
    public function all(Request $request): JsonResponse
    {
        $childIds = ChildAccess::query($request->user())->pluck('children.id');

        $records = ProgressRecord::with(['child', 'recorder'])
            ->whereIn('child_id', $childIds)
            ->orderByDesc('recorded_on')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($records);
    }

    public function index(Request $request, int $child): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);

        $records = ProgressRecord::with('recorder')
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
        ]);

        $record = ProgressRecord::create([
            ...$data,
            'child_id' => $child,
            'recorded_by' => $request->user()->id,
            'recorded_on' => $data['recorded_on'] ?? now()->toDateString(),
        ]);

        return response()->json($record->load('recorder'), 201);
    }
}
