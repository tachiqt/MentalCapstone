<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        $payload = QueryCache::remember(QueryCache::USERS, 120, function () {
            $users = User::query()
                ->with(['children:id,first_name,last_name'])
                ->withCount('children')
                ->orderByDesc('created_at')
                ->get();

            $byRole = [];
            foreach (UserRole::cases() as $role) {
                $byRole[$role->value] = $users->filter(fn (User $user) => $user->role === $role)->count();
            }

            return [
                'users' => $users,
                'analytics' => [
                    'total' => $users->count(),
                    'active' => $users->where('status', 'active')->count(),
                    'inactive' => $users->where('status', 'inactive')->count(),
                    'new_last_7_days' => $users->where('created_at', '>=', now()->subDays(7))->count(),
                    'new_last_14_days' => $users->where('created_at', '>=', now()->subDays(7))->count(),
                    'by_role' => $byRole,
                ],
            ];
        });

        return response()->json($payload);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->whereNull('deleted_at')],
            'username' => ['required', 'string', 'min:3', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')->whereNull('deleted_at')],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
            'role' => ['required', Rule::in(UserRole::values())],
        ], [
            'password.regex' => 'Password must include at least one letter and one number.',
            'username.regex' => 'Username may only contain letters, numbers, dots, hyphens, and underscores (no spaces or @).',
        ]);

        [$user, $restored] = $this->resolveStaffAccount($data);

        $mailSent = $user->trySendEmailVerificationNotification();

        $this->log($request, 'user.created', $user, [
            'target_name' => $user->name,
            'role' => $user->role instanceof UserRole ? $user->role->value : (string) $user->role,
            'mail_sent' => $mailSent,
            'restored' => $restored,
        ]);

        QueryCache::forget(QueryCache::USERS);

        $createdWord = $restored ? 'restored' : 'created';

        // Always give Head Doctor a shareable link; email may fail if SMTP credentials are invalid.
        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'username' => $user->username,
            'role' => $user->role instanceof UserRole ? $user->role->value : $user->role,
            'status' => $user->status,
            'email_verified_at' => $user->email_verified_at,
            'created_at' => $user->created_at,
            'mail_sent' => $mailSent,
            'verification_url' => $user->emailVerificationUrl(),
            'message' => $mailSent
                ? 'Account '.$createdWord.'. A verification email was sent to '.$user->email.'.'
                : 'Account '.$createdWord.', but email delivery failed. Share the verification link with the user.',
        ], 201);
    }

    /**
     * Deleted staff accounts are soft-deleted, but email and username stay unique in the
     * database. Validation only ignores trashed rows, so a plain create() would pass then
     * crash with a duplicate-key error. Reuse the trashed row instead.
     *
     * @param  array{name: string, email: string, username: string, password: string, role: string}  $data
     * @return array{0: User, 1: bool}
     */
    private function resolveStaffAccount(array $data): array
    {
        $emailMatch = User::withTrashed()->where('email', $data['email'])->first();
        $usernameMatch = User::withTrashed()->where('username', $data['username'])->first();

        if ($emailMatch && $usernameMatch && (int) $emailMatch->id !== (int) $usernameMatch->id) {
            throw ValidationException::withMessages([
                'email' => 'That email and username belong to two different deleted accounts. Choose a unique combination or ask an administrator to clean up the old records.',
            ]);
        }

        $existing = $emailMatch ?? $usernameMatch;

        if ($existing) {
            if (! $existing->trashed()) {
                throw ValidationException::withMessages([
                    'email' => 'An account with this email or username already exists.',
                ]);
            }

            $existing->restore();
            $existing->fill([
                'name' => $data['name'],
                'email' => $data['email'],
                'username' => $data['username'],
                'password' => $data['password'],
                'role' => $data['role'],
                'status' => 'active',
            ]);
            $existing->email_verified_at = null;
            $existing->google_id = null;
            $existing->save();

            return [$existing->fresh(), true];
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'username' => $data['username'],
            'password' => $data['password'],
            'role' => $data['role'],
            'status' => 'active',
        ]);

        return [$user, false];
    }

    public function resendVerification(Request $request, User $user): JsonResponse
    {
        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email is already verified.']);
        }

        $mailSent = $user->trySendEmailVerificationNotification();

        $this->log($request, 'user.verification_resent', $user, [
            'target_name' => $user->name,
            'mail_sent' => $mailSent,
        ]);

        QueryCache::forget(QueryCache::USERS);

        return response()->json([
            'message' => $mailSent
                ? 'Verification email sent to '.$user->email.'.'
                : 'Email delivery failed. Share this verification link with the user.',
            'mail_sent' => $mailSent,
            'verification_url' => $user->emailVerificationUrl(),
        ]);
    }

    public function show(User $user): JsonResponse
    {
        $user->load(['children:id,first_name,last_name'])->loadCount('children');

        return response()->json($user);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'username' => ['sometimes', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'password' => ['sometimes', 'string', 'min:8'],
            'role' => ['sometimes', Rule::in(UserRole::values())],
            'status' => ['sometimes', 'string', 'in:active,inactive'],
        ]);

        if (array_key_exists('role', $data)) {
            $nextRole = UserRole::from($data['role']);
            $this->guardLastHeadDoctor($user, $nextRole);
            $from = $user->role instanceof UserRole ? $user->role->value : (string) $user->role;
            $user->update(['role' => $nextRole]);
            $this->log($request, 'user.role_changed', $user, [
                'target_name' => $user->name,
                'from' => $from,
                'to' => $nextRole->value,
            ]);
            unset($data['role']);
        }

        if (array_key_exists('status', $data) && $data['status'] !== $user->status) {
            if ($data['status'] === 'inactive') {
                $this->guardLastHeadDoctor($user, deleting: true);
            }
            $action = $data['status'] === 'inactive' ? 'user.deactivated' : 'user.activated';
            $user->update(['status' => $data['status']]);
            if ($data['status'] === 'inactive' && $user->id !== $request->user()->id) {
                $user->tokens()->delete();
            }
            $this->log($request, $action, $user, ['target_name' => $user->name]);
            unset($data['status']);
        }

        if ($data) {
            $user->update($data);
        }

        // The edited user's own /me snapshot is cached separately, so skipping it
        // here would keep serving them their old name for up to its TTL.
        QueryCache::forget(QueryCache::USERS, QueryCache::meKey($user->id));

        return response()->json($user->fresh()->loadCount('children'));
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
        ], [
            'password.regex' => 'Password must include at least one letter and one number.',
        ]);

        $user->update(['password' => $data['password']]);
        if ($user->id !== $request->user()->id) {
            $user->tokens()->delete();
        }

        $this->log($request, 'user.password_reset', $user, ['target_name' => $user->name]);

        QueryCache::forget(QueryCache::USERS);

        return response()->json([
            'ok' => true,
            'message' => 'Password updated. Share the new password with the user securely.',
        ]);
    }

    public function deactivate(Request $request, User $user): JsonResponse
    {
        if ($user->status !== 'inactive') {
            $this->guardLastHeadDoctor($user, deleting: true);
            $user->update(['status' => 'inactive']);
            if ($user->id !== $request->user()->id) {
                $user->tokens()->delete();
            }
            $this->log($request, 'user.deactivated', $user, ['target_name' => $user->name]);
            QueryCache::forget(QueryCache::USERS);
        }

        return response()->json($user->fresh()->loadCount('children'));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages([
                'user' => 'You cannot delete your own account.',
            ]);
        }

        $this->guardLastHeadDoctor($user, deleting: true);
        $this->log($request, 'user.deleted', $user, [
            'target_name' => $user->name,
            'role' => $user->role instanceof UserRole ? $user->role->value : (string) $user->role,
        ]);
        $user->tokens()->delete();
        // Soft delete: activity logs and care records still point at this row, and
        // the email/username uniqueness rules deliberately ignore deleted users so
        // the address can be reused later.
        $user->delete();

        QueryCache::forget(QueryCache::USERS);

        return response()->json(['ok' => true]);
    }

    private function guardLastHeadDoctor(User $user, ?UserRole $nextRole = null, bool $deleting = false): void
    {
        if ($user->role !== UserRole::HeadDoctor) {
            return;
        }

        $leaving = $deleting || ($nextRole && $nextRole !== UserRole::HeadDoctor);
        if (! $leaving) {
            return;
        }

        $remaining = User::query()
            ->where('role', UserRole::HeadDoctor)
            ->where('status', 'active')
            ->where('id', '!=', $user->id)
            ->count();

        if ($remaining < 1) {
            throw ValidationException::withMessages([
                'role' => 'The facility must keep at least one active Head Doctor.',
            ]);
        }
    }

    private function log(Request $request, string $action, User $subject, array $meta = []): void
    {
        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'subject_type' => User::class,
            'subject_id' => $subject->id,
            'meta' => $meta,
        ]);
    }
}
