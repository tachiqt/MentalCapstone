<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_head_doctor_create_user_sends_verification_email(): void
    {
        Notification::fake();

        $head = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Mobile Teacher',
            'email' => 'teacher@smartcare.local',
            'username' => 'teacher_new',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Teacher->value,
        ])->assertCreated()
            ->assertJsonPath('role', UserRole::Teacher->value)
            ->assertJsonFragment(['message' => 'Account created. A verification email was sent to teacher@smartcare.local.']);

        $user = User::where('email', 'teacher@smartcare.local')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, VerifyEmailNotification::class);
    }

    public function test_unverified_user_cannot_login(): void
    {
        $user = User::factory()->unverified()->create([
            'username' => 'unverified_teacher',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        // The mobile app keys off `reason` to open its resend screen, so the
        // codes matter more than the sentence.
        $this->postJson('/api/v1/login', [
            'username' => 'unverified_teacher',
            'password' => 'password',
            'client' => 'mobile',
        ])->assertForbidden()
            ->assertJsonPath('reason', 'email_unverified')
            ->assertJsonPath('email', $user->email)
            ->assertJsonPath('can_resend', true);
    }

    public function test_verified_user_can_login(): void
    {
        User::factory()->create([
            'username' => 'verified_teacher',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->postJson('/api/v1/login', [
            'username' => 'verified_teacher',
            'password' => 'password',
            'client' => 'mobile',
        ])->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_email_can_be_verified_with_signed_url(): void
    {
        $user = User::factory()->unverified()->create([
            'email' => 'verify@smartcare.local',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1($user->email),
        ]);

        $this->get($url)->assertRedirect('/web/verify-email.html?status=success&google=1&email='.urlencode($user->email));
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_profile_email_change_requires_reverification(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'old@smartcare.local',
            'username' => 'head_profile',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
            'google_id' => 'google-old-id',
        ]);
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/me', [
            'name' => $user->name,
            'username' => $user->username,
            'email' => 'new@smartcare.local',
            'phone' => null,
        ])->assertOk()
            ->assertJsonPath('email_changed', true)
            ->assertJsonPath('user.email', 'new@smartcare.local')
            ->assertJsonStructure(['verification_url', 'expires_minutes', 'mail_sent']);

        $fresh = $user->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertNull($fresh->google_id);
        Notification::assertSentTo($fresh, VerifyEmailNotification::class);
    }

    public function test_google_login_does_not_create_new_users(): void
    {
        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'fake-token',
            'client' => 'mobile',
        ])->assertStatus(401);
    }
}
