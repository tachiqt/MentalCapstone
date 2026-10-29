<?php

namespace App\Http\Middleware;

use App\Enums\UserRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        $role = $user->role instanceof UserRole ? $user->role->value : (string) $user->role;

        if (! in_array($role, $roles, true)) {
            abort(403, 'Forbidden.');
        }

        return $next($request);
    }
}
