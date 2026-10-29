<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
use App\Models\Child;
use App\Models\ChildStatusHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChildStatusLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $head;

    private User $psycho;

    private User $teacher;

    private Child $child;

    private AssessmentChecklist $checklist;

    protected function setUp(): void
    {
        parent::setUp();

        $this->head = User::factory()->create([
            'username' => 'head_status',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->psycho = User::factory()->create([
            'username' => 'psycho_status',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_status',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Leo',
            'last_name' => 'Cruz',
            'age_band' => 5,
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);

        $this->checklist = AssessmentChecklist::create([
            'title' => 'Status checklist',
            'is_active' => true,
            'created_by' => $this->psycho->id,
        ]);
    }

    public function test_index_defaults_to_active_children(): void
    {
        Child::create([
            'first_name' => 'Inactive',
            'last_name' => 'Kid',
            'is_active' => false,
        ]);

        Sanctum::actingAs($this->head);

        $this->getJson('/api/v1/children')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $this->child->id);

        $this->getJson('/api/v1/children?status=inactive')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.first_name', 'Inactive');

        $this->getJson('/api/v1/children?status=all')
            ->assertOk()
            ->assertJsonCount(2);
    }

    public function test_psychometrician_can_inactivate_and_activate(): void
    {
        Sanctum::actingAs($this->psycho);

        $this->patchJson("/api/v1/children/{$this->child->id}/deactivate", [
            'note' => 'Left for family leave',
        ])->assertOk()
            ->assertJsonPath('is_active', false);

        $this->assertDatabaseHas('child_status_histories', [
            'child_id' => $this->child->id,
            'previous_status' => 'active',
            'new_status' => 'inactive',
            'action' => 'inactivated',
            'changed_by' => $this->psycho->id,
        ]);

        $this->patchJson("/api/v1/children/{$this->child->id}/activate")
            ->assertOk()
            ->assertJsonPath('is_active', true);

        $this->assertSame(2, ChildStatusHistory::query()->where('child_id', $this->child->id)->count());
    }

    public function test_soft_delete_preserves_assessments_and_allows_restore(): void
    {
        Sanctum::actingAs($this->psycho);
        $assessment = Assessment::create([
            'child_id' => $this->child->id,
            'assessment_checklist_id' => $this->checklist->id,
            'psychometrician_id' => $this->psycho->id,
            'status' => 'finalized',
        ]);

        Sanctum::actingAs($this->head);
        $this->deleteJson("/api/v1/children/{$this->child->id}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertSoftDeleted('children', ['id' => $this->child->id]);
        $this->assertDatabaseHas('assessments', ['id' => $assessment->id, 'child_id' => $this->child->id]);

        $this->getJson('/api/v1/children?trashed=1')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->child->id]);

        $this->postJson("/api/v1/children/{$this->child->id}/restore")
            ->assertOk()
            ->assertJsonPath('is_active', false)
            ->assertJsonPath('id', $this->child->id);

        $this->assertDatabaseHas('children', [
            'id' => $this->child->id,
            'is_active' => false,
            'deleted_at' => null,
        ]);
        $this->assertDatabaseHas('child_status_histories', [
            'child_id' => $this->child->id,
            'action' => 'restored',
            'new_status' => 'inactive',
        ]);
    }

    public function test_psychometrician_cannot_delete_or_restore(): void
    {
        Sanctum::actingAs($this->psycho);

        $this->deleteJson("/api/v1/children/{$this->child->id}")->assertForbidden();

        $this->child->delete();
        $this->postJson("/api/v1/children/{$this->child->id}/restore")->assertForbidden();
    }

    public function test_teacher_cannot_change_status(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->patchJson("/api/v1/children/{$this->child->id}/deactivate")->assertForbidden();
        $this->patchJson("/api/v1/children/{$this->child->id}/activate")->assertForbidden();
    }

    public function test_cannot_create_assessment_for_inactive_child(): void
    {
        $this->child->update(['is_active' => false]);
        Sanctum::actingAs($this->psycho);

        $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'responses' => [
                ['checklist_item_id' => 1, 'score' => '1'],
            ],
        ])->assertStatus(422)
            ->assertJsonFragment(['message' => 'Cannot create assessments for an inactive child. Activate the child first.']);
    }

    public function test_status_history_endpoint(): void
    {
        Sanctum::actingAs($this->psycho);
        $this->patchJson("/api/v1/children/{$this->child->id}/deactivate")->assertOk();

        $this->getJson("/api/v1/children/{$this->child->id}/status-history")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.action', 'inactivated');
    }
}
