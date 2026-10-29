<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\LearningMaterial;
use App\Models\MedicationSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesOperationalFixture;
use Tests\TestCase;

class RoleOperationalSustainabilityTest extends TestCase
{
    use CreatesOperationalFixture;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->seedOperationalFixture();
    }

    public function test_head_doctor_sustains_facility_administration_flow(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'head_ops',
            'password' => 'password',
            'client' => 'web',
        ])->assertOk()
            ->assertJsonPath('user.role', UserRole::HeadDoctor->value);

        Sanctum::actingAs($this->headDoctor);

        $this->postJson('/api/v1/users', [
            'name' => 'New Psychometrician',
            'email' => 'newpsycho@smartcare.local',
            'username' => 'new_psycho_ops',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
            'role' => UserRole::Psychometrician->value,
        ])->assertCreated()
            ->assertJsonPath('role', UserRole::Psychometrician->value);

        $checklistResponse = $this->postJson('/api/v1/checklists', [
            'title' => 'Published operational checklist',
            'description' => 'Ready for psycho scoring',
            'is_active' => true,
            'items' => [
                ['prompt' => 'Maintains eye contact', 'domain' => 'social', 'sort_order' => 1],
            ],
        ])->assertCreated();

        $publishedChecklistId = $checklistResponse->json('id');

        $this->getJson('/api/v1/reports/facility')
            ->assertOk()
            ->assertJsonStructure([
                'users_by_role',
                'children_count',
                'checklists_total',
                'recommendations_by_status',
            ]);

        $this->putJson('/api/v1/workspace', [
            'facility_name' => 'Malvar Assisted Facility',
            'timezone' => 'Asia/Manila',
            'default_session_minutes' => 45,
            'reminder_lead_minutes' => 15,
        ])->assertOk()
            ->assertJsonPath('facility_name', 'Malvar Assisted Facility');

        $when = now()->addDay()->setTime(10, 0)->toIso8601String();
        Sanctum::actingAs($this->teacher);
        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $when,
            'duration_minutes' => 45,
        ])->assertCreated()
            ->assertJsonPath('child_id', $this->child->id);

        Sanctum::actingAs($this->psychometrician);

        $this->getJson('/api/v1/checklists')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Published operational checklist']);

        $this->getJson("/api/v1/checklists/{$publishedChecklistId}")
            ->assertOk()
            ->assertJsonPath('title', 'Published operational checklist');
    }

    public function test_psychometrician_sustains_assessment_workflow(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'psycho_ops',
            'password' => 'password',
            'client' => 'web',
        ])->assertOk()
            ->assertJsonPath('user.role', UserRole::Psychometrician->value);

        Sanctum::actingAs($this->psychometrician);

        $childResponse = $this->postJson('/api/v1/children', [
            'first_name' => 'Casey',
            'last_name' => 'Reyes',
            'age_band' => 6,
            'is_active' => true,
        ])->assertCreated();

        $childId = $childResponse->json('id');

        $this->getJson("/api/v1/checklists/{$this->checklist->id}")
            ->assertOk()
            ->assertJsonPath('title', 'Operational baseline checklist');

        $assessmentResponse = $this->postJson("/api/v1/children/{$childId}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '2',
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('psychometrician_id', $this->psychometrician->id);

        $assessmentId = $assessmentResponse->json('id');

        $this->postJson("/api/v1/children/{$childId}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $this->getJson("/api/v1/reports/children/{$childId}")
            ->assertOk()
            ->assertJsonStructure(['child', 'assessments']);

        $this->getJson('/api/v1/reports/psychometrician-summary')
            ->assertOk()
            ->assertJsonPath('assessments_submitted_total', 1)
            ->assertJsonPath('awaiting_teacher_review', 1);

        $this->postJson('/api/v1/users', [
            'name' => 'Blocked User',
            'email' => 'blocked@smartcare.local',
            'username' => 'blocked_ops',
            'password' => 'Password1',
            'role' => UserRole::Teacher->value,
        ])->assertForbidden();

        $this->postJson('/api/v1/checklists', [
            'title' => 'Psycho authored checklist',
            'items' => [['prompt' => 'Item', 'domain' => 'motor', 'sort_order' => 1]],
        ])->assertCreated()
            ->assertJsonPath('title', 'Psycho authored checklist');

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $childId,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'duration_minutes' => 45,
        ])->assertForbidden();

        $pending = AiRecommendation::where('assessment_id', $assessmentId)->firstOrFail();
        $this->postJson("/api/v1/recommendations/{$pending->id}/review", [
            'status' => 'approved',
        ])->assertForbidden();
    }

    public function test_teacher_sustains_clinical_delivery_flow(): void
    {
        Sanctum::actingAs($this->psychometrician);
        [, $recommendationId] = $this->createPendingRecommendation();

        Sanctum::actingAs($this->teacher);

        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'approved',
            'teacher_notes' => 'Aligned with classroom goals.',
        ])->assertOk()
            ->assertJsonPath('status', 'approved');

        $when = now()->addDays(2)->setTime(14, 0)->toIso8601String();
        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $when,
            'duration_minutes' => 60,
        ])->assertCreated()
            ->assertJsonPath('status', 'scheduled');

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'time_of_day' => '20:00',
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
        ])->assertCreated()
            ->assertJsonPath('medicine_name', 'Melatonin');

        $this->postJson('/api/v1/learning-materials', [
            'title' => 'Visual schedule cards',
            'description' => 'Daily routine support',
            'type' => 'visual',
            'tags' => ['communication'],
        ])->assertCreated()
            ->assertJsonPath('title', 'Visual schedule cards');

        $this->postJson('/api/v1/login', [
            'username' => 'teacher_ops',
            'password' => 'password',
            'client' => 'web',
        ])->assertForbidden();

        Sanctum::actingAs($this->teacher);

        $this->postJson('/api/v1/users', [
            'name' => 'Should fail',
            'email' => 'failteacher@smartcare.local',
            'username' => 'fail_teacher_ops',
            'password' => 'Password1',
            'role' => UserRole::Caretaker->value,
        ])->assertForbidden();

        $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '1'],
            ],
        ])->assertForbidden();
    }

    public function test_caretaker_sustains_medication_logging_flow(): void
    {
        Sanctum::actingAs($this->teacher);

        $scheduleResponse = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Vitamin D',
            'dosage' => '400 IU',
            'time_of_day' => '08:00',
            'days_of_week' => [1, 2, 3, 4, 5],
        ])->assertCreated();

        $scheduleId = $scheduleResponse->json('id');

        Sanctum::actingAs($this->caretaker);

        $this->postJson('/api/v1/medication-logs', [
            'medication_schedule_id' => $scheduleId,
            'child_id' => $this->child->id,
            'status' => 'given',
            'administered_at' => now()->toIso8601String(),
            'notes' => 'Taken with breakfast',
        ])->assertCreated()
            ->assertJsonPath('status', 'given')
            ->assertJsonPath('caretaker_id', $this->caretaker->id);

        $this->getJson("/api/v1/children/{$this->child->id}/medication-logs")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.status', 'given');

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Should fail',
            'dosage' => '1mg',
            'time_of_day' => '12:00',
            'days_of_week' => [1],
        ])->assertForbidden();

        $this->postJson('/api/v1/users', [
            'name' => 'Blocked Caretaker',
            'email' => 'blockedcar@smartcare.local',
            'username' => 'blocked_car_ops',
            'password' => 'Password1',
            'role' => UserRole::Parent->value,
        ])->assertForbidden();
    }

    public function test_parent_sustains_progress_and_feedback_flow(): void
    {
        Sanctum::actingAs($this->parent);

        $this->getJson("/api/v1/children/{$this->child->id}/progress")
            ->assertOk()
            ->assertJson([]);

        $feedbackResponse = $this->postJson('/api/v1/parent-feedback', [
            'child_id' => $this->child->id,
            'subject' => 'Home practice update',
            'category' => 'communication',
            'message' => 'We practiced sign cards twice this week.',
        ])->assertCreated()
            ->assertJsonPath('subject', 'Home practice update')
            ->assertJsonPath('parent_id', $this->parent->id);

        $feedbackId = $feedbackResponse->json('id');

        $this->getJson("/api/v1/children/{$this->child->id}/parent-feedback")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $feedbackId);

        $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '1'],
            ],
        ])->assertForbidden();

        $schedule = MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Placebo',
            'dosage' => '1mg',
            'time_of_day' => '09:00:00',
            'is_active' => true,
        ]);

        $this->postJson('/api/v1/medication-logs', [
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'status' => 'given',
            'administered_at' => now()->toIso8601String(),
        ])->assertForbidden();

        $this->postJson('/api/v1/users', [
            'name' => 'Blocked Parent',
            'email' => 'blockedpar@smartcare.local',
            'username' => 'blocked_par_ops',
            'password' => 'Password1',
            'role' => UserRole::Parent->value,
        ])->assertForbidden();
    }

    public function test_cross_role_mutations_are_blocked(): void
    {
        $material = LearningMaterial::create([
            'title' => 'Fixture material',
            'type' => 'guide',
            'tags' => ['motor'],
            'uploaded_by' => $this->headDoctor->id,
        ]);

        $cases = [
            [UserRole::Psychometrician, 'putJson', '/api/v1/workspace', [
                'facility_name' => 'Hacked',
                'timezone' => 'Asia/Manila',
                'default_session_minutes' => 45,
                'reminder_lead_minutes' => 10,
            ]],
            [UserRole::Teacher, 'deleteJson', "/api/v1/learning-materials/{$material->id}", []],
            [UserRole::Parent, 'postJson', "/api/v1/children/{$this->child->id}/progress", [
                'title' => 'Blocked milestone',
                'summary' => 'Should not save',
            ]],
            [UserRole::Caretaker, 'postJson', '/api/v1/checklists', [
                'title' => 'Blocked checklist',
                'items' => [['prompt' => 'Item', 'domain' => 'motor', 'sort_order' => 1]],
            ]],
            [UserRole::Psychometrician, 'getJson', '/api/v1/reports/facility', []],
        ];

        foreach ($cases as [$role, $method, $uri, $payload]) {
            $user = match ($role) {
                UserRole::Psychometrician => $this->psychometrician,
                UserRole::Teacher => $this->teacher,
                UserRole::Parent => $this->parent,
                UserRole::Caretaker => $this->caretaker,
                default => $this->headDoctor,
            };

            Sanctum::actingAs($user);

            if ($payload === []) {
                $this->{$method}($uri)->assertForbidden();
            } else {
                $this->{$method}($uri, $payload)->assertForbidden();
            }
        }

        Sanctum::actingAs($this->headDoctor);
        $this->getJson('/api/v1/reports/psychometrician-summary')->assertForbidden();
    }
}
