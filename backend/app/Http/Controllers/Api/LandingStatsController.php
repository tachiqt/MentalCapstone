<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\Assessment;
use App\Models\TherapySession;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

class LandingStatsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $weeks = 8;
        $points = [];
        $cursor = now()->startOfWeek()->subWeeks($weeks - 1);

        for ($i = 0; $i < $weeks; $i++) {
            $start = $cursor->copy()->addWeeks($i);
            $end = $start->copy()->endOfWeek();
            $points[] = TherapySession::query()
                ->where('status', 'completed')
                ->whereBetween('scheduled_at', [$start, $end])
                ->count();
        }

        $prevMonth = TherapySession::query()
            ->where('status', 'completed')
            ->whereBetween('scheduled_at', [
                now()->subMonth()->startOfMonth(),
                now()->subMonth()->endOfMonth(),
            ])
            ->count();

        $thisMonth = TherapySession::query()
            ->where('status', 'completed')
            ->whereBetween('scheduled_at', [
                now()->startOfMonth(),
                now()->endOfMonth(),
            ])
            ->count();

        if ($prevMonth > 0) {
            $improvement = (int) round((($thisMonth - $prevMonth) / $prevMonth) * 100);
        } elseif ($thisMonth > 0) {
            $improvement = 100;
        } else {
            $improvement = $this->severityImprovement();
        }

        $team = $this->careTeamAvatars();

        return response()->json([
            'improvement_percent' => $improvement,
            'sparkline' => $points,
            'sessions_completed_this_month' => $thisMonth,
            'assessments_total' => Assessment::count(),
            'care_team' => $team,
            'updated_at' => Carbon::now()->toIso8601String(),
        ]);
    }

    private function severityImprovement(): int
    {
        $map = [
            'mild' => 1,
            'moderate' => 2,
            'severe' => 3,
            'profound' => 4,
        ];

        $recent = Assessment::query()
            ->whereNotNull('severity_level')
            ->orderByDesc('created_at')
            ->limit(20)
            ->pluck('severity_level');

        if ($recent->count() < 4) {
            return 0;
        }

        $scores = $recent->map(fn ($level) => $map[strtolower((string) $level)] ?? 2)->values();
        $half = (int) floor($scores->count() / 2);
        $newer = $scores->take($half)->avg() ?: 0;
        $older = $scores->slice($half)->avg() ?: 0;

        if ($older <= 0) {
            return 0;
        }

        // Lower severity average = improvement
        return (int) round((($older - $newer) / $older) * 100);
    }

    /**
     * @return list<array{initials: string, role: string, hue: int}>
     */
    private function careTeamAvatars(): array
    {
        $roles = [
            UserRole::HeadDoctor->value => 160,
            UserRole::Psychometrician->value => 190,
            UserRole::Teacher->value => 140,
        ];

        $team = [];
        foreach ($roles as $role => $hue) {
            $user = User::query()
                ->where('role', $role)
                ->where('status', 'active')
                ->orderBy('id')
                ->first(['id', 'name', 'role']);

            if (! $user) {
                continue;
            }

            $team[] = [
                'initials' => $this->initials($user->name),
                'role' => $role,
                'hue' => $hue,
            ];
        }

        return $team;
    }

    private function initials(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [];
        $letters = '';
        foreach (array_slice($parts, 0, 2) as $part) {
            $letters .= mb_strtoupper(mb_substr($part, 0, 1));
        }

        return $letters !== '' ? $letters : 'SC';
    }
}
