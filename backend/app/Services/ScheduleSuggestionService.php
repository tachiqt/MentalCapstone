<?php

namespace App\Services;

use App\Models\AssessmentResponse;
use App\Models\Child;
use App\Models\ProgressRecord;
use App\Models\TherapyPlan;
use App\Models\TherapySession;
use App\Models\WorkspaceSetting;
use Carbon\Carbon;

class ScheduleSuggestionService
{
    /** Operating hours in facility-local time (inclusive start window). */
    public const OPERATING_START = '07:00';

    public const OPERATING_END = '17:00';

    private const MORNING_SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00'];

    private const AFTERNOON_SLOTS = ['13:00', '14:00', '15:00', '16:00'];

    /**
     * @return array{
     *   slots: list<array<string, mixed>>,
     *   insight: string,
     *   basis: array<string, mixed>,
     *   preferred_time_applied?: bool,
     *   message?: string
     * }
     */
    public function suggest(array $input): array
    {
        $childId = (int) $input['child_id'];
        $sessionsPerWeek = (int) $input['sessions_per_week'];
        $tz = WorkspaceSetting::getValue('timezone', 'Asia/Manila');
        $startDate = Carbon::parse($input['start_date'], $tz)->startOfDay();
        $durationMinutes = (int) ($input['duration_minutes'] ?? 60);
        $days = $input['days'] ?? [1, 2, 3, 4, 5];

        $context = $this->buildProgressContext($childId, $input['therapy_plan_id'] ?? null);
        $activities = $context['activities'];

        if (! empty($context['recommended_sessions_per_week']) && empty($input['lock_frequency'])) {
            // Soft preference: only bump when caller left a low default and plan says more.
            $recommended = (int) $context['recommended_sessions_per_week'];
            if ($recommended > $sessionsPerWeek && $sessionsPerWeek <= 2) {
                $sessionsPerWeek = min(5, $recommended);
            }
        }

        $preferMorning = ($context['preferred_band'] ?? 'balanced') === 'morning';
        $preferredRaw = isset($input['preferred_start_time'])
            ? trim((string) $input['preferred_start_time'])
            : '';
        $preferredStartTime = $preferredRaw !== '' ? $this->normalizeTime($preferredRaw) : null;

        $defaultPool = $preferMorning
            ? array_merge(self::MORNING_SLOTS, self::AFTERNOON_SLOTS)
            : array_merge(self::AFTERNOON_SLOTS, self::MORNING_SLOTS);

        $preferredTimeApplied = null;
        $preferredTimeMessage = null;

        if ($preferredStartTime !== null) {
            if (! $this->isWithinOperatingHours($preferredStartTime)
                || ! $this->slotFitsOperatingWindow($preferredStartTime, $durationMinutes)) {
                $timePool = $defaultPool;
                $preferredTimeApplied = false;
                $preferredTimeMessage = 'Preferred start time is outside facility hours ('
                    .self::OPERATING_START.'–'.self::OPERATING_END.'). Slots use the usual rhythm instead.';
            } else {
                $timePool = $this->buildTimePoolWithPreferred($defaultPool, $preferredStartTime);
            }
        } else {
            $timePool = $defaultPool;
        }

        $endDate = $startDate->copy()->addWeeks(2);
        $slots = [];
        $count = 0;
        $target = $sessionsPerWeek * 2;
        $nowLocal = Carbon::now($tz);
        $planId = $context['therapy_plan_id'];
        $teacherId = isset($input['teacher_id']) ? (int) $input['teacher_id'] : null;
        $busySessions = $this->loadTeacherBusySessions($teacherId, $startDate, $endDate, $tz);

        for ($date = $startDate->copy(); $date->lte($endDate) && $count < $target; $date->addDay()) {
            if (! in_array($date->dayOfWeekIso, $days, true)) {
                continue;
            }

            foreach ($timePool as $time) {
                if ($count >= $target) {
                    break 2;
                }

                if (! $this->slotFitsOperatingWindow($time, $durationMinutes)) {
                    continue;
                }

                $scheduledAt = Carbon::parse($date->toDateString().' '.$time, $tz);

                if ($scheduledAt->lt($nowLocal)) {
                    continue;
                }

                if ($this->conflictsWithTeacher($scheduledAt, $durationMinutes, $busySessions, $tz)) {
                    continue;
                }

                $activity = $activities === []
                    ? null
                    : $activities[$count % count($activities)];

                $slots[] = [
                    'child_id' => $childId,
                    'teacher_id' => $input['teacher_id'] ?? null,
                    'therapy_plan_id' => $planId,
                    'scheduled_at' => $scheduledAt->clone()->utc()->toIso8601String(),
                    'duration_minutes' => $durationMinutes,
                    'planned_activity' => $activity,
                    'intervention_notes' => $activity,
                    'reason' => $preferredStartTime !== null && $time === $preferredStartTime
                        ? 'Aligned with your preferred start time'
                        : ($preferMorning
                            ? 'Morning focus window based on recent engagement'
                            : 'Steady afternoon block aligned with care rhythm'),
                ];

                $count++;

                if ($count % $sessionsPerWeek === 0) {
                    break;
                }
            }
        }

        if ($preferredStartTime !== null && $preferredTimeApplied === null) {
            $preferredTimeApplied = $this->slotsIncludePreferredTime($slots, $preferredStartTime, $tz);
            if (! $preferredTimeApplied) {
                $preferredTimeMessage = 'Your preferred start time was not available (conflicts or past times). Nearby times were suggested instead.';
            }
        }

        $basis = [
            'preferred_band' => $context['preferred_band'],
            'sessions_per_week' => $sessionsPerWeek,
            'plan_title' => $context['plan_title'],
            'therapy_plan_id' => $planId,
            'recent_progress_count' => $context['recent_progress_count'],
            'avg_assessment_score' => $context['avg_assessment_score'],
            'engagement' => $context['engagement'],
            'timezone' => $tz,
            'operating_hours' => self::OPERATING_START.'–'.self::OPERATING_END,
        ];

        if ($preferredStartTime !== null) {
            $basis['preferred_start_time'] = $preferredStartTime;
            $basis['preferred_time_applied'] = $preferredTimeApplied;
            if ($preferredTimeMessage !== null) {
                $basis['preferred_time_message'] = $preferredTimeMessage;
            }
        }

        $result = [
            'slots' => $slots,
            'insight' => $context['insight'],
            'basis' => $basis,
        ];

        if ($preferredStartTime !== null) {
            $result['preferred_time_applied'] = $preferredTimeApplied;
            if ($preferredTimeMessage !== null) {
                $result['message'] = $preferredTimeMessage;
            }
        }

        return $result;
    }

    public static function facilityTimezone(): string
    {
        return WorkspaceSetting::getValue('timezone', 'Asia/Manila');
    }

    public static function isWithinOperatingHours(string $time): bool
    {
        return $time >= self::OPERATING_START && $time < self::OPERATING_END;
    }

    public static function slotFitsOperatingWindow(string $time, int $durationMinutes): bool
    {
        if (! self::isWithinOperatingHours($time)) {
            return false;
        }

        $start = Carbon::createFromFormat('H:i', self::normalizeTimeStatic($time));
        $endMinutes = $start->hour * 60 + $start->minute + $durationMinutes;
        $closeMinutes = 17 * 60;

        return $endMinutes <= $closeMinutes;
    }

    /**
     * @param  list<string>  $defaultPool
     * @return list<string>
     */
    private function buildTimePoolWithPreferred(array $defaultPool, string $preferredStartTime): array
    {
        $standard = array_values(array_unique(array_merge(self::MORNING_SLOTS, self::AFTERNOON_SLOTS)));
        sort($standard);

        $after = [];
        $before = [];
        foreach ($standard as $slot) {
            if ($slot > $preferredStartTime) {
                $after[] = $slot;
            } elseif ($slot < $preferredStartTime) {
                $before[] = $slot;
            }
        }

        $pool = array_merge([$preferredStartTime], $after, $before);
        $seen = [];
        $ordered = [];
        foreach ($pool as $time) {
            if (! isset($seen[$time])) {
                $seen[$time] = true;
                $ordered[] = $time;
            }
        }

        foreach ($defaultPool as $time) {
            if (! isset($seen[$time])) {
                $ordered[] = $time;
            }
        }

        return $ordered;
    }

    private function normalizeTime(string $time): string
    {
        return self::normalizeTimeStatic($time);
    }

    private static function normalizeTimeStatic(string $time): string
    {
        $parsed = Carbon::parse($time);

        return $parsed->format('H:i');
    }

    /**
     * @return list<TherapySession>
     */
    private function loadTeacherBusySessions(?int $teacherId, Carbon $startDate, Carbon $endDate, string $tz): array
    {
        if (! $teacherId) {
            return [];
        }

        $rangeStart = $startDate->copy()->timezone($tz)->startOfDay()->utc();
        $rangeEnd = $endDate->copy()->timezone($tz)->endOfDay()->utc();

        return TherapySession::query()
            ->where('teacher_id', $teacherId)
            ->where('status', '!=', 'cancelled')
            ->whereBetween('scheduled_at', [$rangeStart, $rangeEnd])
            ->get(['scheduled_at', 'duration_minutes'])
            ->all();
    }

    /**
     * @param  list<TherapySession>  $busySessions
     */
    private function conflictsWithTeacher(
        Carbon $scheduledAt,
        int $durationMinutes,
        array $busySessions,
        string $tz
    ): bool {
        if ($busySessions === []) {
            return false;
        }

        $start = $scheduledAt->copy()->timezone($tz);
        $end = $start->copy()->addMinutes($durationMinutes);

        foreach ($busySessions as $session) {
            $existingStart = $session->scheduled_at->copy()->timezone($tz);
            $existingEnd = $existingStart->copy()->addMinutes((int) ($session->duration_minutes ?? 60));

            if ($start->lt($existingEnd) && $end->gt($existingStart)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     */
    private function slotsIncludePreferredTime(array $slots, string $preferredStartTime, string $tz): bool
    {
        foreach ($slots as $slot) {
            $local = Carbon::parse($slot['scheduled_at'])->timezone($tz);
            if ($local->format('H:i') === $preferredStartTime) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate a UTC/ISO scheduled_at falls inside facility operating hours.
     */
    public static function scheduledAtWithinOperatingHours(Carbon|string $scheduledAt): bool
    {
        $tz = self::facilityTimezone();
        $local = Carbon::parse($scheduledAt)->timezone($tz);
        $time = $local->format('H:i');

        return self::isWithinOperatingHours($time);
    }

    /**
     * @return array{
     *   insight: string,
     *   preferred_band: string,
     *   recommended_sessions_per_week: ?int,
     *   plan_title: ?string,
     *   therapy_plan_id: ?int,
     *   activities: list<string>,
     *   recent_progress_count: int,
     *   avg_assessment_score: ?float,
     *   engagement: string
     * }
     */
    private function buildProgressContext(int $childId, mixed $therapyPlanId = null): array
    {
        $child = Child::query()->find($childId);
        $name = $child ? trim(($child->first_name ?? '').' '.($child->last_name ?? '')) : 'This child';

        $planQuery = TherapyPlan::query()
            ->with('aiRecommendation')
            ->where('child_id', $childId)
            ->where('status', 'active');

        if ($therapyPlanId) {
            $plan = TherapyPlan::query()
                ->with('aiRecommendation')
                ->where('child_id', $childId)
                ->where('id', (int) $therapyPlanId)
                ->first()
                ?? $planQuery->latest('id')->first();
        } else {
            $plan = $planQuery->latest('id')->first();
        }

        $activities = $this->extractActivities($plan);

        $recentProgress = ProgressRecord::query()
            ->where('child_id', $childId)
            ->latest('recorded_on')
            ->latest('id')
            ->limit(5)
            ->get();

        $recentSessions = TherapySession::query()
            ->where('child_id', $childId)
            ->where('status', 'completed')
            ->latest('scheduled_at')
            ->limit(8)
            ->get(['participation', 'outcomes', 'scheduled_at']);

        $withdrawn = $recentSessions->where('participation', 'withdrawn')->count();
        $partial = $recentSessions->where('participation', 'partial')->count();
        $engaged = $recentSessions->where('participation', 'engaged')->count();

        $responseScores = AssessmentResponse::query()
            ->whereHas('assessment', fn ($q) => $q->where('child_id', $childId))
            ->whereNotNull('score')
            ->latest('id')
            ->limit(40)
            ->pluck('score')
            ->filter(fn ($s) => is_numeric($s));
        if ($responseScores->isNotEmpty()) {
            $avgScore = round((float) $responseScores->avg(), 1);
        } else {
            $avgScore = null;
        }

        $preferredBand = 'balanced';
        $engagement = 'steady';
        if ($withdrawn + $partial > $engaged) {
            $preferredBand = 'morning';
            $engagement = 'needs_support';
        } elseif ($engaged >= 3) {
            $preferredBand = 'afternoon';
            $engagement = 'strong';
        }

        $recommended = $plan?->sessions_per_week ? (int) $plan->sessions_per_week : null;
        if ($avgScore !== null && $avgScore < 50 && (! $recommended || $recommended < 3)) {
            $recommended = max($recommended ?? 2, 3);
        }

        $parts = [];
        if ($plan?->title) {
            $parts[] = 'Active plan “'.trim((string) $plan->title).'” suggests '
                .((int) ($plan->sessions_per_week ?: 2)).' session(s)/week';
        }
        if ($activities !== []) {
            $parts[] = 'Rotating '.count($activities).' planned intervention(s) from the care plan across suggested slots';
        }
        if ($recentProgress->isNotEmpty()) {
            $latest = $recentProgress->first();
            $parts[] = 'Latest progress note: '.trim((string) ($latest->title ?: $latest->summary ?: 'recorded update'));
        }
        if ($avgScore !== null) {
            $parts[] = 'Recent assessment average: '.$avgScore;
        }
        if ($recentSessions->isNotEmpty()) {
            $parts[] = $engagement === 'needs_support'
                ? 'Recent sessions show lower engagement — morning slots preferred for focus'
                : ($engagement === 'strong'
                    ? 'Strong recent engagement — afternoon rhythm is a good fit'
                    : 'Balanced recent participation across sessions');
        }

        if ($parts === []) {
            $insight = $name.' does not have rich progress history yet. Suggested a steady weekday cadence you can edit before saving.';
        } else {
            $insight = 'Suggestions for '.$name.' use care history: '.implode('. ', $parts).'.';
        }

        return [
            'insight' => $insight,
            'preferred_band' => $preferredBand,
            'recommended_sessions_per_week' => $recommended,
            'plan_title' => $plan?->title,
            'therapy_plan_id' => $plan?->id,
            'activities' => $activities,
            'recent_progress_count' => $recentProgress->count(),
            'avg_assessment_score' => $avgScore,
            'engagement' => $engagement,
        ];
    }

    /**
     * @return list<string>
     */
    private function extractActivities(?TherapyPlan $plan): array
    {
        if (! $plan) {
            return [];
        }

        $json = $plan->aiRecommendation?->openai_response_json;
        if (! is_array($json)) {
            return [];
        }

        $titles = [];
        foreach ($json['suggested_activities'] ?? [] as $activity) {
            if (is_string($activity) && trim($activity) !== '') {
                $titles[] = trim($activity);
            } elseif (is_array($activity)) {
                $title = trim((string) ($activity['title'] ?? $activity['name'] ?? $activity['activity'] ?? ''));
                if ($title !== '') {
                    $titles[] = $title;
                }
            }
        }

        if ($titles === []) {
            foreach ($json['intervention_suggestions'] ?? [] as $item) {
                if (is_string($item) && trim($item) !== '') {
                    $titles[] = trim($item);
                } elseif (is_array($item)) {
                    $title = trim((string) ($item['title'] ?? $item['name'] ?? $item['intervention'] ?? ''));
                    if ($title !== '') {
                        $titles[] = $title;
                    }
                }
            }
        }

        return array_values(array_unique($titles));
    }
}
