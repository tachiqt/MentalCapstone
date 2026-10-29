<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AssessmentChecklist;
use App\Models\ChecklistItem;
use App\Models\Child;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PsychometricianRbacTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $psychometrician;

    private Child $child;

    private AssessmentChecklist $checklist;

    private ChecklistItem $checklistItem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->headDoctor = User::factory()->create([
            'username' => 'head_rbac',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->psychometrician = User::factory()->create([
            'username' => 'psycho_rbac',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->child = Child::create([
            'first_name' => 'Alex',
            'last_name' => 'Sample',
            'age_band' => 6,
            'is_active' => true,
        ]);

        $this->checklist = AssessmentChecklist::create([
            'title' => 'Screening checklist',
            'description' => 'Baseline',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        $this->checklistItem = ChecklistItem::create([
            'assessment_checklist_id' => $this->checklist->id,
            'prompt' => 'Follows instructions',
            'domain' => 'communication',
            'sort_order' => 1,
        ]);
    }

    public function test_psychometrician_can_login_on_web_client(): void
    {
        $this->postJson('/api/v1/login', [
            'username' => 'psycho_rbac',
            'password' => 'password',
            'client' => 'web',
        ])->assertOk()
            ->assertJsonPath('user.role', UserRole::Psychometrician->value);
    }

    public function test_psychometrician_can_manage_children_and_read_checklists(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->getJson('/api/v1/children')->assertOk();
        $this->getJson('/api/v1/checklists')->assertOk();
        $this->getJson("/api/v1/checklists/{$this->checklist->id}")->assertOk();

        $this->postJson('/api/v1/children', [
            'first_name' => 'Jordan',
            'last_name' => 'Lee',
            'age_band' => 5,
            'is_active' => true,
        ])->assertCreated();

        $this->putJson("/api/v1/children/{$this->child->id}", [
            'first_name' => 'Alex',
            'last_name' => 'Updated',
            'age_band' => 6,
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('last_name', 'Updated');
    }

    public function test_psychometrician_can_submit_assessment_and_generate_ai(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $assessment = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
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

        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessment->json('id'),
        ])->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $this->getJson("/api/v1/reports/children/{$this->child->id}")->assertOk();
        $this->getJson('/api/v1/reports/psychometrician-summary')
            ->assertOk()
            ->assertJsonPath('assessments_submitted_total', 1)
            ->assertJsonPath('awaiting_teacher_review', 1);
    }

    public function test_psychometrician_cannot_manage_users(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->getJson('/api/v1/users')->assertForbidden();
    }

    public function test_psychometrician_can_manage_checklists(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $created = $this->postJson('/api/v1/checklists', [
            'title' => 'Psycho screening checklist',
            'items' => [['prompt' => 'Follows 1-step direction', 'domain' => 'cognitive', 'sort_order' => 1]],
        ])->assertCreated()
            ->assertJsonPath('title', 'Psycho screening checklist')
            ->json();

        $this->putJson("/api/v1/checklists/{$created['id']}", [
            'title' => 'Psycho screening checklist (revised)',
            'is_active' => true,
            'items' => [['prompt' => 'Follows 2-step direction', 'domain' => 'cognitive', 'sort_order' => 1]],
        ])->assertOk()
            ->assertJsonPath('title', 'Psycho screening checklist (revised)');
    }

    public function test_psychometrician_cannot_update_workspace_or_create_materials(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->putJson('/api/v1/workspace', [
            'facility_name' => 'Hacked Facility',
            'timezone' => 'Asia/Manila',
            'default_session_minutes' => 45,
            'reminder_lead_minutes' => 10,
        ])->assertForbidden();

        $this->postJson('/api/v1/learning-materials', [
            'title' => 'Should fail',
            'type' => 'guide',
        ])->assertForbidden();
    }

    public function test_psychometrician_cannot_mutate_therapy_medication_or_review_ai(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->headDoctor->id,
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'duration_minutes' => 60,
        ])->assertForbidden();

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Example',
            'dosage' => '5ml',
            'times_of_day' => ['08:00'],
            'days_of_week' => [1, 2, 3, 4, 5],
        ])->assertForbidden();

        $this->postJson("/api/v1/children/{$this->child->id}/progress", [
            'notes' => 'Should fail',
            'progress_date' => now()->toDateString(),
        ])->assertForbidden();

        Sanctum::actingAs($this->psychometrician);
        $assessment = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '1'],
            ],
        ])->assertCreated();

        $rec = $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessment->json('id'),
        ])->assertCreated();

        $this->postJson('/api/v1/recommendations/'.$rec->json('id').'/review', [
            'status' => 'approved',
        ])->assertForbidden();
    }

    public function test_psychometrician_search_excludes_staff(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $this->getJson('/api/v1/search?q=head')
            ->assertOk()
            ->assertJsonPath('staff', []);
    }

    public function test_head_doctor_cannot_access_psychometrician_summary(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->getJson('/api/v1/reports/psychometrician-summary')->assertForbidden();
    }
}
