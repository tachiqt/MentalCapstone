<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\TherapySession;
use App\Models\User;
use App\Support\ChildAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json([
                'children' => [],
                'sessions' => [],
                'staff' => [],
            ]);
        }

        $user = $request->user();
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';
        $childQuery = ChildAccess::query($user);

        $children = (clone $childQuery)
            ->where(fn (Builder $query) => $this->matchChild($query, $q, $like))
            ->orderBy('last_name')
            ->limit(8)
            ->get(['id', 'first_name', 'last_name', 'diagnosis', 'is_active']);

        $childIds = (clone $childQuery)->select('children.id');
        $sessions = TherapySession::query()
            ->with([
                'child:id,first_name,last_name',
                'teacher:id,name',
            ])
            ->whereIn('child_id', $childIds)
            ->where(function (Builder $query) use ($q, $like) {
                $query->where('status', 'like', $like)
                    ->orWhereHas('child', fn (Builder $child) => $this->matchChild($child, $q, $like))
                    ->orWhereHas('teacher', function (Builder $teacher) use ($like) {
                        $teacher->where('name', 'like', $like)
                            ->orWhere('username', 'like', $like);
                    });
            })
            ->orderByDesc('scheduled_at')
            ->limit(8)
            ->get();

        $staff = [];
        $role = $user->role instanceof UserRole ? $user->role : UserRole::tryFrom((string) $user->role);
        if ($role === UserRole::HeadDoctor) {
            $staff = User::query()
                ->where(function (Builder $query) use ($like) {
                    $query->where('name', 'like', $like)
                        ->orWhere('email', 'like', $like)
                        ->orWhere('username', 'like', $like);
                })
                ->orderBy('name')
                ->limit(8)
                ->get(['id', 'name', 'email', 'username', 'role', 'status']);
        }

        return response()->json([
            'children' => $children,
            'sessions' => $sessions,
            'staff' => $staff,
        ]);
    }

    private function matchChild(Builder $query, string $q, string $like): void
    {
        $query->where('first_name', 'like', $like)
            ->orWhere('last_name', 'like', $like)
            ->orWhere('diagnosis', 'like', $like);

        $parts = preg_split('/\s+/', $q) ?: [];
        if (count($parts) >= 2) {
            $query->orWhere(function (Builder $inner) use ($parts) {
                $inner->where('first_name', 'like', $parts[0].'%')
                    ->where('last_name', 'like', '%'.end($parts).'%');
            });
        }
    }
}
