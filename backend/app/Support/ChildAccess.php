<?php

namespace App\Support;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ChildAccess
{
    public static function query(User $user): Builder
    {
        // Callers that need trashed rows must opt in with onlyTrashed()/withTrashed().
        if (in_array($user->role, [UserRole::HeadDoctor, UserRole::Psychometrician], true)) {
            return Child::query();
        }

        $relation = match ($user->role) {
            UserRole::Parent => 'parent',
            UserRole::Teacher => 'teacher',
            UserRole::Caretaker => 'caretaker',
            default => null,
        };

        return Child::query()->whereHas('users', function (Builder $query) use ($user, $relation) {
            $query->where('users.id', $user->id);
            if ($relation) {
                $query->where('child_user.relation', $relation);
            }
        });
    }

    public static function canAccess(User $user, Child $child): bool
    {
        // Soft-deleted profiles are only recoverable by head doctors.
        if ($child->trashed()) {
            return $user->role === UserRole::HeadDoctor;
        }

        return static::query($user)->whereKey($child->id)->exists();
    }

    public static function findOrFail(User $user, int $childId): Child
    {
        return static::query($user)->findOrFail($childId);
    }
}
