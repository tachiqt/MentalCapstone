<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    public function verify(Request $request, string $id, string $hash): RedirectResponse
    {
        $user = User::find($id);

        if (! $user || ! hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
            return redirect('/web/verify-email.html?status=invalid');
        }

        if ($user->hasVerifiedEmail()) {
            return redirect('/web/verify-email.html?status=already');
        }

        if (! $request->hasValidSignature()) {
            return redirect('/web/verify-email.html?status=expired');
        }

        $user->markEmailAsVerified();

        $email = urlencode($user->email);

        return redirect('/web/verify-email.html?status=success&google=1&email='.$email);
    }

    public function resend(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email is already verified.']);
        }

        return $this->sendForUser($user);
    }

    public function resendByEmail(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        $user = User::query()->where('email', $data['email'])->first();

        if (! $user) {
            return response()->json([
                'message' => 'We could not send a verification email to that address. Contact your Head Doctor if you need access.',
                'mail_sent' => false,
            ]);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email is already verified.', 'mail_sent' => false]);
        }

        return $this->sendForUser($user);
    }

    private function sendForUser(User $user): \Illuminate\Http\JsonResponse
    {
        $mailSent = $user->trySendEmailVerificationNotification();
        $expires = (int) config('auth.verification.expire', 60);

        $payload = [
            'message' => $mailSent
                ? 'Verification link sent. It expires in '.$expires.' minutes.'
                : 'Email delivery failed. Tap Resend to try again — links expire in '.$expires.' minutes.',
            'mail_sent' => $mailSent,
            'can_resend' => ! $mailSent,
            'expires_minutes' => $expires,
        ];

        if (config('app.debug')) {
            $payload['verification_url'] = $user->emailVerificationUrl();
        }

        return response()->json($payload);
    }
}
