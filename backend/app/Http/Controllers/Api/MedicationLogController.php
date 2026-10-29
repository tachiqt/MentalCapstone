<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicationLog;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MedicationLogController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        if ($request->filled('schedule_id') && ! $request->filled('medication_schedule_id')) {
            $request->merge(['medication_schedule_id' => $request->input('schedule_id')]);
        }

        $scheduleId = $request->input('medication_schedule_id');
        $schedule = $scheduleId ? \App\Models\MedicationSchedule::find($scheduleId) : null;

        if ($schedule && ! $request->filled('child_id')) {
            $request->merge(['child_id' => $schedule->child_id]);
        }

        if (! $request->filled('administered_at')) {
            $request->merge(['administered_at' => now()->toIso8601String()]);
        }

        $data = $request->validate([
            'medication_schedule_id' => ['required', 'exists:medication_schedules,id'],
            'child_id' => ['required', 'exists:children,id'],
            'status' => ['required', Rule::in(['given', 'missed', 'refused', 'partial', 'skipped'])],
            'administered_at' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        if ($data['status'] === 'skipped') {
            $data['status'] = 'missed';
        }

        ChildAccess::findOrFail($request->user(), $data['child_id']);

        $log = MedicationLog::create([
            ...$data,
            'caretaker_id' => $request->user()->id,
        ]);

        return response()->json($log->load(['schedule', 'child', 'caretaker']), 201);
    }

    public function all(Request $request): JsonResponse
    {
        $childIds = ChildAccess::query($request->user())->pluck('children.id');

        $logs = MedicationLog::with(['schedule', 'child', 'caretaker'])
            ->whereIn('child_id', $childIds)
            ->orderByDesc('administered_at')
            ->limit(50)
            ->get()
            ->map(fn (MedicationLog $log) => [
                ...$log->toArray(),
                'medication_name' => $log->schedule?->medicine_name,
                'child_name' => trim(($log->child?->first_name ?? '').' '.($log->child?->last_name ?? '')),
                'logged_at' => $log->administered_at,
            ]);

        return response()->json($logs);
    }

    public function index(Request $request, int $child): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $child);

        $logs = MedicationLog::with(['schedule', 'caretaker'])
            ->where('child_id', $child)
            ->orderByDesc('administered_at')
            ->get()
            ->map(fn (MedicationLog $log) => [
                ...$log->toArray(),
                'medication_name' => $log->schedule?->medicine_name,
                'dosage' => $log->schedule?->dosage,
                'logged_at' => $log->administered_at,
            ]);

        return response()->json($logs);
    }
}
