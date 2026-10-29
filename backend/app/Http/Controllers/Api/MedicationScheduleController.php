<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicationLog;
use App\Models\MedicationSchedule;
use App\Support\ChildAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MedicationScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = MedicationSchedule::query()
            ->whereIn('child_id', ChildAccess::query($request->user())->select('children.id'))
            ->with(['child', 'creator'])
            ->orderByDesc('created_at');

        if ($request->filled('child_id')) {
            ChildAccess::findOrFail($request->user(), (int) $request->child_id);
            $query->where('child_id', $request->child_id);
        }

        if ($request->boolean('today')) {
            $query->where('is_active', true);
        }

        $today = (int) now()->dayOfWeek;
        $wantToday = $request->boolean('today');
        $matched = $query->get()
            ->filter(function (MedicationSchedule $schedule) use ($wantToday, $today) {
                if (! $wantToday) {
                    return true;
                }

                $days = collect($schedule->days_of_week ?? [])
                    ->map(fn ($day) => (int) $day)
                    ->all();

                // Null/empty days means every day.
                return $days === [] || in_array($today, $days, true);
            })
            ->values();

        $logsBySchedule = collect();
        if ($wantToday && $matched->isNotEmpty()) {
            $dayStart = Carbon::now()->startOfDay();
            $dayEnd = Carbon::now()->endOfDay();
            $logsBySchedule = MedicationLog::query()
                ->whereIn('medication_schedule_id', $matched->pluck('id'))
                ->whereBetween('administered_at', [$dayStart, $dayEnd])
                ->orderBy('administered_at')
                ->get()
                ->groupBy('medication_schedule_id');
        }

        $schedules = $matched
            ->flatMap(function (MedicationSchedule $schedule) use ($wantToday, $logsBySchedule) {
                $childName = trim(($schedule->child?->first_name ?? '').' '.($schedule->child?->last_name ?? ''));
                $base = [
                    ...$schedule->toArray(),
                    'medication_name' => $schedule->medicine_name,
                    'name' => $schedule->medicine_name,
                    'child_name' => $childName,
                    'frequency' => $schedule->instructions,
                ];

                $times = collect($schedule->times_of_day ?? [])
                    ->filter()
                    ->map(fn ($time) => substr((string) $time, 0, 5))
                    ->unique()
                    ->sort()
                    ->values()
                    ->all();

                if ($times === [] && $schedule->time_of_day) {
                    $times = [substr((string) $schedule->time_of_day, 0, 5)];
                }

                if ($times === []) {
                    $times = ['09:00'];
                }

                $todayLogs = $logsBySchedule->get($schedule->id, collect())->values();

                // Mobile "Today" expects one row per dose time with scheduled_time/time.
                if ($wantToday) {
                    return collect($times)->map(function (string $time, int $index) use ($base, $schedule, $todayLogs) {
                        $log = $todayLogs->get($index);

                        return [
                            ...$base,
                            // Keep schedule id for logging; unique client keys can use time.
                            'id' => $schedule->id,
                            'dose_key' => $schedule->id.'-'.$time,
                            'time_of_day' => $time,
                            'scheduled_time' => $time,
                            'time' => $time,
                            'sort_index' => $index,
                            'logged_today' => (bool) $log,
                            'status' => $log?->status,
                            'notes' => $log?->notes,
                            'log_id' => $log?->id,
                        ];
                    });
                }

                return [[
                    ...$base,
                    'scheduled_time' => $times[0],
                    'time' => $times[0],
                ]];
            })
            ->values();

        return response()->json($schedules);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedSchedule($request, true);
        ChildAccess::findOrFail($request->user(), $data['child_id']);

        $schedule = MedicationSchedule::create([
            ...$this->normalizeTimes($data),
            'created_by' => $request->user()->id,
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json($schedule->load(['child', 'creator']), 201);
    }

    public function update(Request $request, MedicationSchedule $medicationSchedule): JsonResponse
    {
        ChildAccess::findOrFail($request->user(), $medicationSchedule->child_id);

        $data = $this->normalizeTimes($this->validatedSchedule($request, false));
        $medicationSchedule->update($data);

        return response()->json($medicationSchedule->fresh()->load(['child', 'creator']));
    }

    private function validatedSchedule(Request $request, bool $creating): array
    {
        return $request->validate([
            'child_id' => [$creating ? 'required' : 'sometimes', 'exists:children,id'],
            'medicine_name' => [$creating ? 'required' : 'sometimes', 'string', 'max:255'],
            'dosage' => ['nullable', 'string', 'max:255'],
            'instructions' => ['nullable', 'string', 'max:255'],
            'time_of_day' => ['nullable', 'date_format:H:i'],
            'times_of_day' => ['nullable', 'array', 'min:1', 'max:4'],
            'times_of_day.*' => ['date_format:H:i'],
            'days_of_week' => ['nullable', 'array'],
            'days_of_week.*' => ['integer', 'min:0', 'max:6'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function normalizeTimes(array $data): array
    {
        $times = collect($data['times_of_day'] ?? [])
            ->filter()
            ->map(fn ($time) => substr((string) $time, 0, 5))
            ->unique()
            ->values()
            ->all();

        if ($times === [] && ! empty($data['time_of_day'])) {
            $times = [substr((string) $data['time_of_day'], 0, 5)];
        }

        if ($times !== []) {
            $data['times_of_day'] = $times;
            $data['time_of_day'] = $times[0];
        }

        return $data;
    }
}
