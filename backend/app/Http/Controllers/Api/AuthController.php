<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AvatarStorage;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            'client' => ['sometimes', 'nullable', 'string', 'in:web,mobile'],
        ]);

        $login = $credentials['username'];

        $user = User::query()
            ->where('username', $login)
            ->orWhere('email', $login)
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if ($user->status !== 'active') {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        if (! $user->hasVerifiedEmail()) {
            return $this->unverifiedResponse($user);
        }

        $role = $user->role instanceof UserRole ? $user->role : UserRole::tryFrom((string) $user->role);
        if (($credentials['client'] ?? null) === 'web' && (! $role || ! $role->isWebRole())) {
            return response()->json([
                'message' => 'This account is for the SmartCare mobile app. Teachers, caretakers, and parents cannot sign in on the web.',
            ], 403);
        }

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
        ]);
    }

    public function googleLogin(Request $request): JsonResponse
    {
        $request->validate([
            'id_token' => ['required', 'string'],
            'client' => ['sometimes', 'nullable', 'string', 'in:web,mobile'],
        ]);

        $response = Http::get('https://oauth2.googleapis.com/tokeninfo', [
            'id_token' => $request->id_token,
        ]);

        if ($response->failed() || ! $response->json('email')) {
            return response()->json(['message' => 'Invalid Google token.'], 401);
        }

        $payload = $response->json();
        $expectedAudience = (string) config('services.google.client_id', '');
        $audience = (string) ($payload['aud'] ?? '');
        if ($expectedAudience !== '' && $audience !== $expectedAudience) {
            return response()->json(['message' => 'Invalid Google token audience.'], 401);
        }

        $email = $payload['email'];

        $user = User::where('email', $email)->first();

        if (! $user) {
            return response()->json([
                'message' => 'No SmartCare account is registered for this Google email. Ask your Head Doctor to create and verify your account first.',
            ], 403);
        }

        if ($user->status !== 'active') {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        if (! $user->hasVerifiedEmail()) {
            return $this->unverifiedResponse($user);
        }

        $role = $user->role instanceof UserRole ? $user->role : UserRole::tryFrom((string) $user->role);
        if (($request->client ?? null) === 'web' && (! $role || ! $role->isWebRole())) {
            return response()->json([
                'message' => 'This account is for the SmartCare mobile app. Teachers, caretakers, and parents cannot sign in on the web.',
            ], 403);
        }

        if (! $user->google_id) {
            $user->update(['google_id' => $payload['sub'] ?? null]);
        }

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user->fresh(),
        ]);
    }

    /**
     * The account exists and the caller already proved they own it (correct
     * password, or a Google token for this address) — they just have not opened
     * the verification link the Head Doctor's invite already mailed them. The
     * `reason` code lets the mobile app show the resend screen instead of
     * matching on prose.
     */
    private function unverifiedResponse(User $user): JsonResponse
    {
        return response()->json([
            'message' => 'We already sent a verification link to '.$user->email.'. Open it to activate your account, or resend it below.',
            'reason' => 'email_unverified',
            'email' => $user->email,
            'can_resend' => true,
        ], 403);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        $cached = QueryCache::remember(QueryCache::meKey($user->id), 60, function () use ($user) {
            return $user->fresh() ?? $user;
        });

        return response()->json($cached);
    }

    public function updateMe(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:255', 'regex:/^[\pL\s.\'-]+$/u'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)->whereNull('deleted_at')],
            'username' => ['required', 'string', 'min:3', 'max:50', 'regex:/^[A-Za-z0-9_]+$/', Rule::unique('users', 'username')->ignore($user->id)->whereNull('deleted_at')],
            'phone' => ['nullable', 'string', 'max:40'],
        ], [
            'name.regex' => 'Use letters, spaces, apostrophes, or hyphens only.',
            'username.regex' => 'Username may only contain letters, numbers, and underscores.',
        ]);

        $emailChanged = strcasecmp((string) $user->email, (string) $data['email']) !== 0;

        $user->fill($data);
        if ($emailChanged) {
            $user->email_verified_at = null;
            $user->google_id = null;
        }
        $user->save();

        $mailSent = false;
        $verificationUrl = null;
        if ($emailChanged) {
            $mailSent = $user->trySendEmailVerificationNotification();
            $verificationUrl = $user->emailVerificationUrl();
        }

        QueryCache::forget(QueryCache::meKey($user->id));

        $fresh = $user->fresh();

        return response()->json([
            'user' => $fresh,
            'email_changed' => $emailChanged,
            'mail_sent' => $mailSent,
            'verification_url' => $verificationUrl,
            'expires_minutes' => (int) config('auth.verification.expire', 15),
            'message' => $emailChanged
                ? ($mailSent
                    ? 'Profile saved. Verify your new email address — the link expires in '.(int) config('auth.verification.expire', 15).' minutes.'
                    : 'Profile saved. Verify your new email with the link below, then sign in with Google.')
                : 'Profile saved.',
        ]);
    }

    public function uploadAvatar(Request $request, AvatarStorage $avatars): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, [UserRole::HeadDoctor, UserRole::Psychometrician], true)) {
            return response()->json(['message' => 'Only Head Doctors and Psychometricians can upload a profile photo.'], 403);
        }

        $data = $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $path = $avatars->store($data['photo'], $user->id, $user->avatar_path);
        $user->update(['avatar_path' => $path]);

        QueryCache::forget(QueryCache::meKey($user->id));

        return response()->json($user->fresh());
    }

    public function deleteAvatar(Request $request, AvatarStorage $avatars): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, [UserRole::HeadDoctor, UserRole::Psychometrician], true)) {
            return response()->json(['message' => 'Only Head Doctors and Psychometricians can manage a profile photo.'], 403);
        }

        $avatars->delete($user->avatar_path);
        $user->update(['avatar_path' => null]);

        QueryCache::forget(QueryCache::meKey($user->id));

        return response()->json($user->fresh());
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
        ], [
            'password.regex' => 'Password must include at least one letter and one number.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->update(['password' => $data['password']]);
        $token = $user->currentAccessToken();
        $currentId = $token && isset($token->id) ? $token->id : null;
        if ($currentId) {
            $user->tokens()->where('id', '!=', $currentId)->delete();
        }

        QueryCache::forget(QueryCache::meKey($user->id));

        return response()->json(['ok' => true, 'message' => 'Password updated. Other sessions were signed out.']);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $data = $request->validate([
            'notify_records' => ['required', 'boolean'],
            'notify_schedules' => ['required', 'boolean'],
            'compact_nav' => ['sometimes', 'boolean'],
            'theme' => ['sometimes', 'string', Rule::in(['light', 'dark'])],
        ]);

        $user = $request->user();
        $user->update([
            'preferences' => array_merge(is_array($user->preferences) ? $user->preferences : [], $data),
        ]);

        QueryCache::forget(QueryCache::meKey($user->id));

        return response()->json($user->fresh());
    }

    public function logoutOthers(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();
        $currentId = $token && isset($token->id) ? $token->id : null;
        if ($currentId) {
            $request->user()->tokens()->where('id', '!=', $currentId)->delete();
        } else {
            $request->user()->tokens()->delete();
        }

        return response()->json(['ok' => true, 'message' => 'Other devices were signed out.']);
    }
}
