<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\Child;
use App\Models\LearningMaterial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChildLearningMaterialSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private Child $child;

    private Child $otherChild;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create([
            'username' => 'teacher_lm_sync',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->otherTeacher = User::factory()->create([
            'username' => 'teacher_lm_other',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Ava',
            'last_name' => 'Lee',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);

        $this->otherChild = Child::create([
            'first_name' => 'Ben',
            'last_name' => 'Ng',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->otherChild->users()->attach($this->otherTeacher->id, ['relation' => 'teacher']);
    }

    public function test_teacher_can_assign_library_materials_to_child_without_duplicates(): void
    {
        Sanctum::actingAs($this->teacher);

        $a = LearningMaterial::create([
            'title' => 'Picture cards',
            'type' => 'visual',
            'uploaded_by' => $this->teacher->id,
        ]);
        $b = LearningMaterial::create([
            'title' => 'Turn-taking sheet',
            'type' => 'worksheet',
            'uploaded_by' => $this->teacher->id,
        ]);

        $this->putJson("/api/v1/children/{$this->child->id}/learning-materials", [
            'learning_material_ids' => [$a->id, $b->id, $a->id],
        ])->assertOk()
            ->assertJsonCount(2)
            ->assertJsonFragment(['id' => $a->id])
            ->assertJsonFragment(['id' => $b->id]);

        $this->assertDatabaseCount('child_learning_material', 2);
        $this->assertDatabaseHas('learning_materials', ['id' => $a->id, 'deleted_at' => null]);
    }

    public function test_unassign_does_not_delete_library_material_or_affect_other_child(): void
    {
        Sanctum::actingAs($this->teacher);

        $shared = LearningMaterial::create([
            'title' => 'Shared guide',
            'type' => 'guide',
            'uploaded_by' => $this->teacher->id,
        ]);

        $this->putJson("/api/v1/children/{$this->child->id}/learning-materials", [
            'learning_material_ids' => [$shared->id],
        ])->assertOk();

        Sanctum::actingAs($this->otherTeacher);
        $this->putJson("/api/v1/children/{$this->otherChild->id}/learning-materials", [
            'learning_material_ids' => [$shared->id],
        ])->assertOk();

        Sanctum::actingAs($this->teacher);
        $this->putJson("/api/v1/children/{$this->child->id}/learning-materials", [
            'learning_material_ids' => [],
        ])->assertOk()->assertJsonCount(0);

        $this->assertDatabaseHas('learning_materials', ['id' => $shared->id, 'deleted_at' => null]);
        $this->assertDatabaseMissing('child_learning_material', [
            'child_id' => $this->child->id,
            'learning_material_id' => $shared->id,
        ]);
        $this->assertDatabaseHas('child_learning_material', [
            'child_id' => $this->otherChild->id,
            'learning_material_id' => $shared->id,
        ]);

        Sanctum::actingAs($this->otherTeacher);
        $this->getJson("/api/v1/learning-materials?child_id={$this->otherChild->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $shared->id]);
    }

    public function test_removing_recommendation_material_hides_it_until_readded(): void
    {
        Sanctum::actingAs($this->teacher);

        $material = LearningMaterial::create([
            'title' => 'AI suggested',
            'type' => 'activity',
            'uploaded_by' => $this->teacher->id,
        ]);

        AiRecommendation::create([
            'child_id' => $this->child->id,
            'status' => 'approved',
            'openai_response_json' => [
                'learning_material_ids' => [$material->id],
                'attached_materials' => [['id' => $material->id, 'title' => $material->title]],
            ],
        ]);

        $this->getJson("/api/v1/learning-materials?child_id={$this->child->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $material->id]);

        $this->putJson("/api/v1/children/{$this->child->id}/learning-materials", [
            'learning_material_ids' => [],
        ])->assertOk()->assertJsonCount(0);

        $this->getJson("/api/v1/learning-materials?child_id={$this->child->id}")
            ->assertOk()
            ->assertJsonCount(0);

        $this->putJson("/api/v1/children/{$this->child->id}/learning-materials", [
            'learning_material_ids' => [$material->id],
        ])->assertOk()
            ->assertJsonFragment(['id' => $material->id]);
    }

    public function test_teacher_cannot_sync_unassigned_child(): void
    {
        Sanctum::actingAs($this->teacher);

        $material = LearningMaterial::create([
            'title' => 'Blocked',
            'type' => 'guide',
            'uploaded_by' => $this->teacher->id,
        ]);

        $this->putJson("/api/v1/children/{$this->otherChild->id}/learning-materials", [
            'learning_material_ids' => [$material->id],
        ])->assertForbidden();
    }
}
