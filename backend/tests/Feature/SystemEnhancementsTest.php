<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
use App\Models\ChecklistItem;
use App\Models\Child;
use App\Models\MedicationLog;
use App\Models\MedicationSchedule;
use App\Models\TherapySession;
use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Automated coverage for the Oct 2026 system enhancements:
 * medication reports, checklist edit, preferred start time,
 * teacher assessment/AI access, and verification email behavior.
 */
class SystemEnhancementsTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $psychometrician;

    private User $teacher;

    private User $otherTeacher;

    private User $caretaker;

    private Child $child;

    private Child $otherChild;

    private AssessmentChecklist $checklist;

    private ChecklistItem $checklistItem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->headDoctor = User::factory()->create([
            'username' => 'hd_enh',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->psychometrician = User::factory()->create([
            'username' => 'psycho_enh',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_enh',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->otherTeacher = User::factory()->create([
            'username' => 'teacher_other_enh',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->caretaker = User::factory()->create([
            'username' => 'care_enh',
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Nina',
            'last_name' => 'Santos',
            'age_band' => 7,
            'is_active' => true,
        ]);

        $this->otherChild = Child::create([
            'first_name' => 'Omar',
            'last_name' => 'Cruz',
            'age_band' => 9,
            'is_active' => true,
        ]);

        $this->child->users()->attach([
            $this->teacher->id => ['relation' => 'teacher'],
            $this->caretaker->id => ['relation' => 'caretaker'],
        ]);
        $this->otherChild->users()->attach($this->otherTeacher->id, ['relation' => 'teacher']);

        $this->checklist = AssessmentChecklist::create([
            'title' => 'Baseline skills',
            'description' => "Category: Developmental\nPurpose: Screening",
            'created_by' => $this->psychometrician->id,
            'is_active' => true,
        ]);

        $this->checklistItem = ChecklistItem::create([
            'assessment_checklist_id' => $this->checklist->id,
            'prompt' => 'Responds to name',
            'domain' => 'social',
            'sort_order' => 1,
        ]);
    }

    /* ---------- Medication reports ---------- */

    public function test_head_doctor_medication_report_weekly_and_monthly_summaries(): void
    {
        $schedule = MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Vitamin D',
            'dosage' => '1ml',
            'time_of_day' => '08:00:00',
            'is_active' => true,
        ]);

        // Keep in-window times inside the current week (startOfWeek → now).
        MedicationLog::create([
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'given',
            'administered_at' => now()->startOfWeek()->addHours(10),
            'notes' => 'OK',
        ]);

        MedicationLog::create([
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'missed',
            'administered_at' => now()->subHours(2),
        ]);

        // Outside current week/month window
        MedicationLog::create([
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'given',
            'administered_at' => now()->subMonths(2),
        ]);

        Sanctum::actingAs($this->headDoctor);

        $monthly = $this->getJson('/api/v1/reports/medication?period=monthly')
            ->assertOk()
            ->assertJsonPath('period.preset', 'monthly')
            ->assertJsonPath('summary.children_given_count', 1)
            ->assertJsonPath('summary.doses_by_status.given', 1)
            ->assertJsonPath('summary.doses_by_status.missed', 1)
            ->json();

        $this->assertGreaterThanOrEqual(2, $monthly['summary']['total_logs']);
        $this->assertTrue(collect($monthly['rows'])->contains(
            fn ($row) => ($row['medicine'] ?? null) === 'Vitamin D' && ($row['status'] ?? null) === 'given'
        ));

        $this->getJson('/api/v1/reports/medication?period=weekly')
            ->assertOk()
            ->assertJsonPath('period.preset', 'weekly')
            ->assertJsonPath('summary.doses_by_status.given', 1)
            ->assertJsonPath('summary.doses_by_status.missed', 1);

        $from = now()->startOfWeek()->toDateString();
        $to = now()->toDateString();
        $this->getJson("/api/v1/reports/medication?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('summary.total_logs', 2);
    }

    public function test_medication_report_forbidden_for_non_head_doctor_roles(): void
    {
        Sanctum::actingAs($this->teacher);
        $this->getJson('/api/v1/reports/medication?period=monthly')->assertForbidden();

        Sanctum::actingAs($this->psychometrician);
        $this->getJson('/api/v1/reports/medication?period=monthly')->assertForbidden();

        Sanctum::actingAs($this->caretaker);
        $this->getJson('/api/v1/reports/medication?period=monthly')->assertForbidden();
    }

    public function test_medication_report_empty_period_returns_zero_summary(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->getJson('/api/v1/reports/medication?period=weekly')
            ->assertOk()
            ->assertJsonPath('summary.children_given_count', 0)
            ->assertJsonPath('summary.total_logs', 0)
            ->assertJsonPath('summary.doses_by_status.given', 0)
            ->assertJsonCount(0, 'rows');
    }

    /* ---------- Checklist edit ---------- */

    public function test_psychometrician_can_edit_checklist_items_and_metadata(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->putJson("/api/v1/checklists/{$this->checklist->id}", [
            'title' => 'Updated baseline skills',
            'description' => "Category: Communication\nPurpose: Progress check",
            'is_active' => true,
            'items' => [
                [
                    'prompt' => 'Initiates greeting',
                    'domain' => 'social',
                    'sort_order' => 0,
                ],
                [
                    'prompt' => 'Uses two-word phrases',
                    'domain' => 'language',
                    'sort_order' => 1,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('title', 'Updated baseline skills')
            ->assertJsonCount(2, 'items')
            ->assertJsonPath('items.0.prompt', 'Initiates greeting')
            ->assertJsonPath('items.1.domain', 'language');

        $this->assertDatabaseMissing('checklist_items', [
            'id' => $this->checklistItem->id,
        ]);
        $this->assertDatabaseHas('checklist_items', [
            'assessment_checklist_id' => $this->checklist->id,
            'prompt' => 'Uses two-word phrases',
        ]);
    }

    public function test_teacher_cannot_edit_checklists(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->putJson("/api/v1/checklists/{$this->checklist->id}", [
            'title' => 'Hacked title',
            'items' => [
                ['prompt' => 'Nope', 'sort_order' => 0],
            ],
        ])->assertForbidden();
    }

    /* ---------- Preferred start time ---------- */

    public function test_suggest_applies_preferred_start_time_when_available(): void
    {
        Sanctum::actingAs($this->teacher);

        $start = Carbon::now('Asia/Manila')->next('Monday')->toDateString();

        $response = $this->postJson('/api/v1/therapy-sessions/suggest', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'start_date' => $start,
            'sessions_per_week' => 2,
            'duration_minutes' => 60,
            'days' => [1, 2, 3, 4, 5],
            'preferred_start_time' => '09:00',
        ])->assertOk();

        $this->assertTrue($response->json('preferred_time_applied'));
        $this->assertSame('09:00', $response->json('basis.preferred_start_time'));

        $firstLocal = Carbon::parse($response->json('suggested_slots.0.scheduled_at'))
            ->timezone('Asia/Manila')
            ->format('H:i');
        $this->assertSame('09:00', $firstLocal);
    }

    public function test_suggest_reports_when_preferred_time_outside_hours(): void
    {
        Sanctum::actingAs($this->teacher);

        $response = $this->postJson('/api/v1/therapy-sessions/suggest', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'start_date' => Carbon::now('Asia/Manila')->next('Monday')->toDateString(),
            'sessions_per_week' => 1,
            'duration_minutes' => 60,
            'days' => [1, 2, 3, 4, 5],
            'preferred_start_time' => '20:00',
        ])->assertOk();

        $this->assertFalse($response->json('preferred_time_applied'));
        $this->assertNotEmpty($response->json('message'));
        $this->assertNotEmpty($response->json('suggested_slots'));
    }

    public function test_suggest_skips_preferred_slot_when_teacher_has_conflict(): void
    {
        Sanctum::actingAs($this->teacher);

        $monday = Carbon::now('Asia/Manila')->next('Monday')->setTime(9, 0);

        TherapySession::create([
            'child_id' => $this->otherChild->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $monday->copy()->utc(),
            'duration_minutes' => 60,
            'status' => 'scheduled',
        ]);

        // Attach this teacher to other child so conflict session is realistic
        $this->otherChild->users()->syncWithoutDetaching([
            $this->teacher->id => ['relation' => 'teacher'],
        ]);

        $response = $this->postJson('/api/v1/therapy-sessions/suggest', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'start_date' => $monday->toDateString(),
            'sessions_per_week' => 1,
            'duration_minutes' => 60,
            'days' => [1],
            'preferred_start_time' => '09:00',
        ])->assertOk();

        $slots = $response->json('suggested_slots') ?? [];
        foreach ($slots as $slot) {
            $local = Carbon::parse($slot['scheduled_at'])->timezone('Asia/Manila');
            if ($local->isSameDay($monday)) {
                $this->assertNotSame('09:00', $local->format('H:i'));
            }
        }
    }

    /* ---------- Assessment independent of AI + teacher access ---------- */

    public function test_assessment_is_saved_without_ai_and_teacher_can_generate_later(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $created = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'notes' => 'No AI yet',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '3',
                    'comment' => 'Consistent',
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('ai_generation_status', 'none')
            ->json();

        $this->assertDatabaseHas('assessments', [
            'id' => $created['id'],
            'status' => 'finalized',
        ]);
        $this->assertDatabaseCount('ai_recommendations', 0);

        Sanctum::actingAs($this->teacher);

        $this->getJson("/api/v1/assessments/{$created['id']}")
            ->assertOk()
            ->assertJsonPath('ai_generation_status', 'none')
            ->assertJsonPath('notes', 'No AI yet');

        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $created['id'],
        ])->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $this->getJson("/api/v1/assessments/{$created['id']}")
            ->assertOk()
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('ai_generation_status', 'pending_review');
    }

    public function test_teacher_cannot_submit_assessment_and_unassigned_teacher_cannot_view(): void
    {
        Sanctum::actingAs($this->psychometrician);
        $assessmentId = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '1'],
            ],
        ])->assertCreated()->json('id');

        Sanctum::actingAs($this->teacher);
        $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '2'],
            ],
        ])->assertForbidden();

        Sanctum::actingAs($this->otherTeacher);
        $this->getJson("/api/v1/assessments/{$assessmentId}")->assertForbidden();
        $this->getJson('/api/v1/assessments')
            ->assertOk()
            ->assertJsonMissing(['id' => $assessmentId]);
    }

    public function test_teacher_cannot_generate_ai_when_recommendation_already_locked(): void
    {
        Sanctum::actingAs($this->psychometrician);
        $assessmentId = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '2'],
            ],
        ])->assertCreated()->json('id');

        Sanctum::actingAs($this->teacher);
        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated();

        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertStatus(422);
    }

    /* ---------- Verification email ---------- */

    public function test_verification_expire_defaults_to_sixty_minutes(): void
    {
        $this->assertSame(60, (int) config('auth.verification.expire'));
    }

    public function test_public_resend_verification_reports_mail_sent_honestly(): void
    {
        Notification::fake();

        $user = User::factory()->unverified()->create([
            'email' => 'invitee@smartcare.local',
            'username' => 'invitee_enh',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/auth/resend-verification', [
            'email' => 'invitee@smartcare.local',
        ])->assertOk()
            ->assertJsonPath('mail_sent', true)
            ->assertJsonStructure(['message', 'mail_sent', 'verification_url', 'expires_minutes']);

        Notification::assertSentTo($user, VerifyEmailNotification::class);

        $this->postJson('/api/v1/auth/resend-verification', [
            'email' => 'missing@smartcare.local',
        ])->assertOk()
            ->assertJsonPath('mail_sent', false);
    }

    public function test_staff_create_account_returns_mail_sent_and_verification_url(): void
    {
        Notification::fake();
        Sanctum::actingAs($this->headDoctor);

        $this->postJson('/api/v1/users', [
            'name' => 'New Caretaker',
            'email' => 'newcare@smartcare.local',
            'username' => 'newcare_enh',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Caretaker->value,
        ])->assertCreated()
            ->assertJsonPath('mail_sent', true)
            ->assertJsonStructure(['verification_url', 'mail_sent', 'message']);

        $created = User::where('email', 'newcare@smartcare.local')->firstOrFail();
        Notification::assertSentTo($created, VerifyEmailNotification::class);
    }
}
