<?php

namespace Tests\Concerns;

use App\Enums\UserRole;
use App\Models\AssessmentChecklist;
use App\Models\ChecklistItem;
use App\Models\Child;
use App\Models\User;

trait CreatesOperationalFixture
{
    protected User $headDoctor;

    protected User $psychometrician;

    protected User $teacher;

    protected User $caretaker;

    protected User $parent;

    protected Child $child;

    protected AssessmentChecklist $checklist;

    protected ChecklistItem $checklistItem;

    protected function seedOperationalFixture(): void
    {
        $this->headDoctor = User::factory()->create([
            'username' => 'head_ops',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->psychometrician = User::factory()->create([
            'username' => 'psycho_ops',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_ops',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->caretaker = User::factory()->create([
            'username' => 'caretaker_ops',
            'role' => UserRole::Caretaker,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_ops',
            'role' => UserRole::Parent,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->child = Child::create([
            'first_name' => 'Jordan',
            'last_name' => 'Santos',
            'age_band' => 7,
            'is_active' => true,
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->caretaker->id, ['relation' => 'caretaker']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);

        $this->checklist = AssessmentChecklist::create([
            'title' => 'Operational baseline checklist',
            'description' => 'Shared fixture for sustainability tests',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        $this->checklistItem = ChecklistItem::create([
            'assessment_checklist_id' => $this->checklist->id,
            'prompt' => 'Responds to name',
            'domain' => 'communication',
            'sort_order' => 1,
        ]);
    }

    /**
     * @return array{0: int, 1: int}
     */
    protected function createPendingRecommendation(): array
    {
        $assessmentId = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'moderate',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '2',
                ],
            ],
        ])->assertCreated()->json('id');

        $recommendationId = $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated()->json('id');

        return [(int) $assessmentId, (int) $recommendationId];
    }
}
