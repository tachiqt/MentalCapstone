<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AssessmentChecklist;
use App\Models\Child;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * End-to-end walkthroughs of the real SmartCare workflows, driven entirely
 * through the HTTP API the way the web dashboard and the Expo app drive it.
 *
 * Each test is one job somebody actually does in the facility, from the first
 * request to the notification the next person receives. Nothing is stubbed
 * past the AI provider, which the service already fakes under `testing`.
 */
class CareJourneyTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $psychometrician;

    private User $teacher;

    private User $caretaker;

    private User $parent;

    private Child $child;

    protected function setUp(): void
    {
        parent::setUp();

        $this->headDoctor = $this->staff('journey_head', UserRole::HeadDoctor);
        $this->psychometrician = $this->staff('journey_psych', UserRole::Psychometrician);
        $this->teacher = $this->staff('journey_teacher', UserRole::Teacher);
        $this->caretaker = $this->staff('journey_caretaker', UserRole::Caretaker);
        $this->parent = $this->staff('journey_parent', UserRole::Parent);

        $this->child = Child::create([
            'first_name' => 'Emma',
            'last_name' => 'Torres',
            'age_band' => 6,
            'diagnosis' => 'Autism spectrum disorder',
            'is_active' => true,
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->caretaker->id, ['relation' => 'caretaker']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    /* -------------------------------------------------------- onboarding */

    public function test_head_doctor_onboards_a_teacher_who_must_verify_email_before_first_sign_in(): void
    {
        NotificationFacade::fake();

        Sanctum::actingAs($this->headDoctor);

        $created = $this->postJson('/api/v1/users', [
            'name' => 'Ms. Rivera',
            'email' => 'rivera@example.com',
            'username' => 'ms_rivera',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'role' => 'teacher',
        ])->assertCreated();

        $newTeacher = User::where('username', 'ms_rivera')->firstOrFail();
        $this->assertNull($newTeacher->email_verified_at, 'A new account must start unverified.');
        $this->assertNotNull($created->json('id'));

        // Signing out of the admin session the way the dashboard does before the
        // new user tries the mobile app.
        app('auth')->forgetGuards();

        $this->postJson('/api/v1/login', [
            'username' => 'ms_rivera',
            'password' => 'Password123',
            'client' => 'mobile',
        ])->assertStatus(403);

        $newTeacher->markEmailAsVerified();

        $this->postJson('/api/v1/login', [
            'username' => 'ms_rivera',
            'password' => 'Password123',
            'client' => 'mobile',
        ])->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'name', 'role']]);
    }

    /**
     * The mobile app shows a "we already sent your link" screen with a single
     * resend button, so the refusal has to be machine-readable rather than only
     * a sentence.
     */
    public function test_first_sign_in_before_verifying_explains_the_link_was_already_sent(): void
    {
        $invited = User::factory()->unverified()->create([
            'username' => 'invited_caretaker',
            'email' => 'invited.caretaker@example.com',
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/login', [
            'username' => 'invited_caretaker',
            'password' => 'password',
            'client' => 'mobile',
        ])
            ->assertStatus(403)
            ->assertJsonPath('reason', 'email_unverified')
            ->assertJsonPath('email', $invited->email)
            ->assertJsonPath('can_resend', true);
    }

    public function test_the_invited_user_can_resend_their_own_verification_link(): void
    {
        $invited = User::factory()->unverified()->create([
            'username' => 'invited_parent',
            'email' => 'invited.parent@example.com',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        // Resending is public: the account cannot obtain a token yet.
        $this->postJson('/api/v1/auth/resend-verification', ['email' => $invited->email])
            ->assertOk()
            ->assertJsonStructure(['message', 'mail_sent', 'verification_url']);

        // Still unverified until the link itself is opened.
        $this->assertNull($invited->fresh()->email_verified_at);

        // An unknown address must not reveal whether an account exists.
        $this->postJson('/api/v1/auth/resend-verification', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonPath('mail_sent', false);

        // An already-verified account is told there is nothing to do.
        $this->postJson('/api/v1/auth/resend-verification', ['email' => $this->teacher->email])
            ->assertOk()
            ->assertJsonPath('mail_sent', false);
    }

    public function test_google_sign_in_reports_the_same_unverified_reason(): void
    {
        $invited = User::factory()->unverified()->create([
            'username' => 'invited_teacher',
            'email' => 'invited.teacher@example.com',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        // Stand in for Google's tokeninfo endpoint so the controller reaches its
        // own verification check.
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'email' => $invited->email,
                'sub' => '1234567890',
                'aud' => (string) config('services.google.client_id', ''),
                'email_verified' => 'true',
            ]),
        ]);

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'stub-token',
            'client' => 'mobile',
        ])
            ->assertStatus(403)
            ->assertJsonPath('reason', 'email_unverified')
            ->assertJsonPath('email', $invited->email);
    }

    public function test_google_sign_in_issues_a_token_for_a_verified_mobile_account(): void
    {
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'email' => $this->caretaker->email,
                'sub' => '9876543210',
                'aud' => (string) config('services.google.client_id', ''),
                'email_verified' => 'true',
            ]),
        ]);

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'stub-token',
            'client' => 'mobile',
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'role']])
            ->assertJsonPath('user.id', $this->caretaker->id);

        // The Google identity is remembered so later sign-ins match on it.
        $this->assertSame('9876543210', $this->caretaker->fresh()->google_id);
    }

    public function test_google_sign_in_refuses_an_email_with_no_smartcare_account(): void
    {
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'email' => 'stranger@example.com',
                'sub' => '5555',
                'aud' => (string) config('services.google.client_id', ''),
                'email_verified' => 'true',
            ]),
        ]);

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'stub-token',
            'client' => 'mobile',
        ])->assertStatus(403);
    }

    public function test_a_mobile_role_cannot_sign_in_on_the_web_dashboard(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'journey_teacher',
            'password' => 'password',
            'client' => 'web',
        ])->assertStatus(403);

        $this->postJson('/api/v1/login', [
            'username' => 'journey_teacher',
            'password' => 'password',
            'client' => 'mobile',
        ])->assertOk();
    }

    public function test_assigning_a_child_gives_access_and_tells_the_assigned_user(): void
    {
        $newCaretaker = $this->staff('journey_caretaker_2', UserRole::Caretaker);

        Sanctum::actingAs($newCaretaker);
        $this->getJson('/api/v1/children')->assertOk()->assertJsonCount(0);

        Sanctum::actingAs($this->headDoctor);
        $this->postJson("/api/v1/children/{$this->child->id}/assign", [
            'user_id' => $newCaretaker->id,
            'relation' => 'caretaker',
        ])->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $newCaretaker->id,
            'type' => 'record.assignment',
        ]);

        Sanctum::actingAs($newCaretaker);
        $this->getJson('/api/v1/children')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $this->child->id);
    }

    public function test_batch_assign_puts_children_on_teacher_care_list(): void
    {
        $teacher = $this->staff('journey_teacher_batch', UserRole::Teacher);
        $second = Child::create([
            'first_name' => 'Batch',
            'last_name' => 'Sibling',
            'age_band' => 5,
            'is_active' => true,
        ]);

        Sanctum::actingAs($teacher);
        $this->getJson('/api/v1/children')->assertOk()->assertJsonCount(0);

        Sanctum::actingAs($this->headDoctor);
        $this->postJson('/api/v1/assignments', [
            'user_id' => $teacher->id,
            'relation' => 'teacher',
            'child_ids' => [$this->child->id, $second->id],
        ])
            ->assertOk()
            ->assertJsonPath('assigned_count', 2);

        Sanctum::actingAs($teacher);
        $this->getJson('/api/v1/children')
            ->assertOk()
            ->assertJsonCount(2);
    }

    /* ---------------------------------------------------------- clinical */

    public function test_assessment_becomes_an_ai_plan_the_teacher_reviews_into_a_therapy_plan(): void
    {
        $checklist = $this->checklist();

        // 1. Psychometrician scores the child against the checklist.
        Sanctum::actingAs($this->psychometrician);

        $assessment = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $checklist->id,
            'severity_level' => 'moderate',
            'notes' => 'Responds well to visual prompts.',
            'responses' => $checklist->items->map(fn ($item, $i) => [
                'checklist_item_id' => $item->id,
                'score' => (string) ($i % 3),
                'comment' => 'Observed during session.',
            ])->all(),
        ])->assertCreated()->json();

        // The family and the teaching side are told an assessment landed.
        $this->assertNotified($this->teacher, 'record.assessment');
        $this->assertNotified($this->parent, 'record.assessment');

        // 2. Psychometrician asks for the AI plan (faked under `testing`).
        $recommendation = $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessment['id'],
        ])->assertCreated()->json();

        $this->assertSame('pending_review', $recommendation['status']);

        // The teacher owns the review step, so only they are pulled in.
        $this->assertNotified($this->teacher, 'record.recommendation');
        $this->assertNotNotified($this->parent, 'record.recommendation');

        // 3. Teacher finds it in their review feed and approves it.
        Sanctum::actingAs($this->teacher);

        $feed = $this->getJson('/api/v1/recommendations?status=pending_review')->assertOk()->json();
        $this->assertNotEmpty($feed, 'The approved plan must reach the teacher review feed.');
        $this->assertSame($recommendation['id'], $feed[0]['id']);

        $reviewed = $this->postJson("/api/v1/recommendations/{$recommendation['id']}/review", [
            'status' => 'approved',
            'teacher_notes' => 'Matches what I see in class.',
        ])->assertOk()->json();

        $this->assertSame('approved', $reviewed['status']);

        // Approving mints the therapy plan the schedule hangs off.
        $this->assertDatabaseHas('therapy_plans', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'status' => 'active',
        ]);

        // 4. Now that it is approved, the family side is told the outcome.
        $this->assertNotified($this->parent, 'record.recommendation');
        $this->assertNotified($this->caretaker, 'record.recommendation');

        // 5. A reviewed plan cannot be re-reviewed.
        $this->postJson("/api/v1/recommendations/{$recommendation['id']}/review", [
            'status' => 'rejected',
        ])->assertStatus(422);
    }

    public function test_teacher_schedules_a_session_and_the_whole_circle_is_told(): void
    {
        Sanctum::actingAs($this->teacher);

        $session = $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'duration_minutes' => 45,
        ])->assertCreated()->json();

        $this->assertNotified($this->caretaker, 'record.therapy');
        $this->assertNotified($this->parent, 'record.therapy');
        $this->assertNotNotified($this->teacher, 'record.therapy');

        // The parent sees it on their schedule tab.
        Sanctum::actingAs($this->parent);
        $this->getJson("/api/v1/therapy-sessions?child_id={$this->child->id}")
            ->assertOk()
            ->assertJsonPath('0.id', $session['id']);
    }

    /* --------------------------------------------------- daily care loop */

    public function test_daily_medication_round_from_schedule_to_logged_dose(): void
    {
        // 1. Teacher sets up the medication.
        Sanctum::actingAs($this->teacher);

        $schedule = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'instructions' => 'Give at bedtime',
            'time_of_day' => '20:00',
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
        ])->assertCreated()->json();

        // The caretaker who has to administer it is told first.
        $this->assertNotified($this->caretaker, 'record.medication');
        $this->assertNotified($this->parent, 'record.medication');

        // 2. Caretaker sees it on their Today tab.
        Sanctum::actingAs($this->caretaker);
        $this->getJson('/api/v1/medication-schedules')
            ->assertOk()
            ->assertJsonPath('0.medicine_name', 'Melatonin');

        // 3. Caretaker logs the dose.
        $this->postJson('/api/v1/medication-logs', [
            'medication_schedule_id' => $schedule['id'],
            'child_id' => $this->child->id,
            'status' => 'given',
            'administered_at' => now()->toIso8601String(),
            'notes' => 'Taken with water.',
        ])->assertCreated()->assertJsonPath('caretaker_id', $this->caretaker->id);

        // 4. Teacher and parent hear about it; the caretaker does not get told
        //    about their own action.
        $this->assertNotified($this->teacher, 'record.medication_log');
        $this->assertNotified($this->parent, 'record.medication_log');
        $this->assertNotNotified($this->caretaker, 'record.medication_log');

        // 5. The parent can see the dose history for their child.
        Sanctum::actingAs($this->parent);
        $this->getJson("/api/v1/children/{$this->child->id}/medication-logs")
            ->assertOk()
            ->assertJsonPath('0.status', 'given');
    }

    public function test_only_a_caretaker_may_log_a_dose(): void
    {
        Sanctum::actingAs($this->teacher);

        $schedule = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
        ])->assertCreated()->json();

        foreach ([$this->teacher, $this->parent] as $user) {
            Sanctum::actingAs($user);
            $this->postJson('/api/v1/medication-logs', [
                'medication_schedule_id' => $schedule['id'],
                'child_id' => $this->child->id,
                'status' => 'given',
            ])->assertForbidden();
        }
    }

    public function test_progress_note_and_parent_feedback_close_the_loop(): void
    {
        // Teacher records a milestone.
        Sanctum::actingAs($this->teacher);

        $this->postJson("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Used the choice board unprompted',
            'summary' => 'Picked a snack without a verbal cue.',
            'milestone' => 'Communication',
        ])->assertCreated();

        $this->assertNotified($this->parent, 'record.progress');
        $this->assertNotified($this->caretaker, 'record.progress');

        // Parent reads it, then replies with feedback.
        Sanctum::actingAs($this->parent);

        $this->getJson("/api/v1/children/{$this->child->id}/progress")
            ->assertOk()
            ->assertJsonPath('0.title', 'Used the choice board unprompted');

        $this->postJson('/api/v1/parent-feedback', [
            'child_id' => $this->child->id,
            'subject' => 'Bedtime routine',
            'message' => 'She did the same thing at home tonight.',
        ])->assertCreated();

        // The teaching side is told; the parent who wrote it is not.
        $this->assertNotified($this->teacher, 'record.feedback');
        $this->assertNotified($this->caretaker, 'record.feedback');
        $this->assertNotNotified($this->parent, 'record.feedback');
    }

    /**
     * Feedback with no subject is the common case from the mobile form, and it
     * used to crash the controller.
     */
    public function test_parent_feedback_works_without_a_subject(): void
    {
        Sanctum::actingAs($this->parent);

        $this->postJson('/api/v1/parent-feedback', [
            'child_id' => $this->child->id,
            'message' => 'Quick note with no subject line.',
        ])->assertCreated()->assertJsonPath('subject', 'Parent feedback');
    }

    /* ------------------------------------------------------ notifications */

    public function test_notification_inbox_read_lifecycle(): void
    {
        // Generate something for the teacher to read.
        Sanctum::actingAs($this->caretaker);
        $this->postJson("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Settled quickly after transition',
        ])->assertCreated();

        Sanctum::actingAs($this->teacher);

        $inbox = $this->getJson('/api/v1/notifications')->assertOk()->json();
        $this->assertArrayHasKey('notifications', $inbox);
        $this->assertArrayHasKey('unread', $inbox);
        $this->assertGreaterThan(0, $inbox['unread']);

        $first = $inbox['notifications'][0];

        // The mobile screen marks a single row read with PATCH.
        $this->patchJson("/api/v1/notifications/{$first['id']}/read")->assertOk();
        $this->assertNotNull(Notification::find($first['id'])->read_at);

        $afterOne = $this->getJson('/api/v1/notifications')->assertOk()->json();
        $this->assertSame($inbox['unread'] - 1, $afterOne['unread']);

        // "Mark all read" clears the badge.
        $this->postJson('/api/v1/notifications/read-all')->assertOk();
        $this->assertSame(0, $this->getJson('/api/v1/notifications')->json('unread'));
    }

    public function test_a_user_cannot_read_someone_elses_notification(): void
    {
        Sanctum::actingAs($this->caretaker);
        $this->postJson("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Quiet morning',
        ])->assertCreated();

        $parentRow = Notification::where('user_id', $this->parent->id)->firstOrFail();

        Sanctum::actingAs($this->teacher);
        $this->patchJson("/api/v1/notifications/{$parentRow->id}/read")->assertForbidden();
    }

    /* ------------------------------------------------------ access rules */

    public function test_each_role_only_sees_children_they_are_linked_to(): void
    {
        $otherChild = Child::create([
            'first_name' => 'Noah',
            'last_name' => 'Reyes',
            'age_band' => 7,
            'is_active' => true,
        ]);

        foreach ([$this->teacher, $this->caretaker, $this->parent] as $user) {
            Sanctum::actingAs($user);

            $this->getJson('/api/v1/children')
                ->assertOk()
                ->assertJsonCount(1)
                ->assertJsonPath('0.id', $this->child->id);

            $response = $this->getJson("/api/v1/children/{$otherChild->id}");
            $this->assertContains(
                $response->status(),
                [403, 404],
                "{$user->username} must not reach an unlinked child."
            );
        }
    }

    public function test_mobile_roles_cannot_reach_head_doctor_only_endpoints(): void
    {
        foreach ([$this->teacher, $this->caretaker, $this->parent] as $user) {
            Sanctum::actingAs($user);
            $this->getJson('/api/v1/users')->assertForbidden();
            $this->postJson('/api/v1/children', [
                'first_name' => 'Should',
                'last_name' => 'Fail',
            ])->assertForbidden();
        }
    }

    public function test_logging_out_invalidates_the_token(): void
    {
        $login = $this->postJson('/api/v1/login', [
            'username' => 'journey_parent',
            'password' => 'password',
            'client' => 'mobile',
        ])->assertOk();

        $token = $login->json('token');
        $auth = ['Authorization' => "Bearer {$token}"];

        $this->getJson('/api/v1/me', $auth)->assertOk();
        $this->postJson('/api/v1/logout', [], $auth)->assertOk();

        // The guard caches the resolved user for the lifetime of the test
        // process, so drop it to make the next call behave like a fresh request
        // from the phone.
        app('auth')->forgetGuards();

        $this->getJson('/api/v1/me', $auth)->assertUnauthorized();
    }

    /* ---------------------------------------------------------- helpers */

    private function staff(string $username, UserRole $role): User
    {
        return User::factory()->create([
            'username' => $username,
            'email' => "{$username}@example.com",
            'role' => $role,
            'status' => 'active',
        ]);
    }

    private function checklist(): AssessmentChecklist
    {
        $checklist = AssessmentChecklist::create([
            'title' => 'Early communication screen',
            'description' => 'Journey test checklist',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        foreach (['Follows a one-step instruction', 'Makes a choice from two items', 'Initiates a greeting'] as $i => $prompt) {
            $checklist->items()->create([
                'prompt' => $prompt,
                'domain' => 'Communication',
                'sort_order' => $i,
            ]);
        }

        return $checklist->load('items');
    }

    private function assertNotified(User $user, string $type): void
    {
        $this->assertTrue(
            Notification::where('user_id', $user->id)->where('type', $type)->exists(),
            "Expected {$user->username} to be notified about {$type}."
        );
    }

    private function assertNotNotified(User $user, string $type): void
    {
        $this->assertFalse(
            Notification::where('user_id', $user->id)->where('type', $type)->exists(),
            "Did not expect {$user->username} to be notified about {$type}."
        );
    }
}
