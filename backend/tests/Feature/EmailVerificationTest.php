<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
        config(['app.debug' => false]);

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
            ->assertJsonPath('mail_sent', true)
            ->assertJsonMissing(['verification_url'])
            ->assertJsonFragment(['message' => 'Account created. A verification email was sent to teacher@smartcare.local.']);

        $user = User::where('email', 'teacher@smartcare.local')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, VerifyEmailNotification::class);
    }

    public function test_duplicate_active_account_returns_already_registered(): void
    {
        Notification::fake();

        $head = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        User::factory()->create([
            'email' => 'taken@smartcare.local',
            'username' => 'taken_user',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Another Teacher',
            'email' => 'taken@smartcare.local',
            'username' => 'taken_user',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Teacher->value,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        Notification::assertNothingSent();
    }

    public function test_create_user_mail_failure_keeps_account_without_public_url(): void
    {
        config([
            'app.debug' => false,
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 9,
            'mail.mailers.smtp.timeout' => 1,
        ]);

        $head = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $response = $this->postJson('/api/v1/users', [
            'name' => 'Offline Teacher',
            'email' => 'offline.teacher@smartcare.local',
            'username' => 'offline_teacher',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Teacher->value,
        ]);

        $response->assertCreated()
            ->assertJsonPath('mail_sent', false)
            ->assertJsonPath('can_resend', true)
            ->assertJsonMissing(['verification_url']);

        $this->assertDatabaseHas('users', [
            'email' => 'offline.teacher@smartcare.local',
            'username' => 'offline_teacher',
        ]);

        $this->postJson('/api/v1/users', [
            'name' => 'Offline Teacher Again',
            'email' => 'offline.teacher@smartcare.local',
            'username' => 'offline_teacher',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Teacher->value,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_soft_deleted_account_restore_sends_verification(): void
    {
        Notification::fake();
        config(['app.debug' => false]);

        $head = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        $deleted = User::factory()->create([
            'email' => 'restored@smartcare.local',
            'username' => 'restored_user',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        $deleted->delete();
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Restored Teacher',
            'email' => 'restored@smartcare.local',
            'username' => 'restored_user',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Teacher->value,
        ])->assertCreated()
            ->assertJsonPath('mail_sent', true)
            ->assertJsonMissing(['verification_url']);

        Notification::assertSentTo(
            User::where('email', 'restored@smartcare.local')->firstOrFail(),
            VerifyEmailNotification::class
        );
    }

    public function test_head_doctor_resend_verification_is_rate_limited(): void
    {
        Notification::fake();
        config(['app.debug' => false]);

        $head = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        $user = User::factory()->unverified()->create([
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson("/api/v1/users/{$user->id}/resend-verification")
                ->assertOk()
                ->assertJsonMissing(['verification_url']);
        }

        $this->postJson("/api/v1/users/{$user->id}/resend-verification")
            ->assertStatus(429);
    }

    public function test_unverified_user_cannot_login(): void
    {
        Notification::fake();

        $user = User::factory()->unverified()->create([
            'username' => 'unverified_teacher',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        // The mobile app keys off `reason` to open its resend screen, so the
        // codes matter more than the sentence. Login also mails a fresh link.
        $this->postJson('/api/v1/login', [
            'username' => 'unverified_teacher',
            'password' => 'password',
            'client' => 'mobile',
        ])->assertForbidden()
            ->assertJsonPath('reason', 'email_unverified')
            ->assertJsonPath('email', $user->email)
            ->assertJsonPath('mail_sent', true)
            ->assertJsonPath('can_resend', true);

        Notification::assertSentTo($user, VerifyEmailNotification::class);
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
        config(['app.debug' => false]);

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
            ->assertJsonPath('mail_sent', true)
            ->assertJsonStructure(['expires_minutes', 'mail_sent'])
            ->assertJsonMissing(['verification_url']);

        $fresh = $user->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertNull($fresh->google_id);
        Notification::assertSentTo($fresh, VerifyEmailNotification::class);
    }

    public function test_google_login_does_not_create_new_users(): void
    {
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response(['error' => 'invalid_token'], 400),
        ]);

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'fake-token',
            'client' => 'mobile',
        ])->assertStatus(401);

        $this->assertDatabaseCount('users', 0);
    }
}
