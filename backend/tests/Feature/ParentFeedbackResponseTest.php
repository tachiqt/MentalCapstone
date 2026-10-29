<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\ParentFeedback;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ParentFeedbackResponseTest extends TestCase
{
    use RefreshDatabase;

    private Child $child;

    private User $parent;

    private User $teacher;

    private ParentFeedback $feedback;

    protected function setUp(): void
    {
        parent::setUp();

        $this->child = Child::create([
            'first_name' => 'Leo',
            'last_name' => 'Garcia',
            'age_band' => 8,
            'is_active' => true,
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_fb',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_fb',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);

        $this->feedback = ParentFeedback::create([
            'parent_id' => $this->parent->id,
            'child_id' => $this->child->id,
            'subject' => 'Parent feedback',
            'message' => 'Child seemed happier after yesterday’s visit.',
            'status' => 'open',
        ]);
    }

    public function test_teacher_can_acknowledge_and_respond_to_parent_feedback(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->patchJson("/api/v1/parent-feedback/{$this->feedback->id}", [
            'status' => 'acknowledged',
        ])->assertOk()
            ->assertJsonPath('status', 'acknowledged');

        $this->patchJson("/api/v1/parent-feedback/{$this->feedback->id}", [
            'status' => 'addressed',
            'staff_response' => 'Thank you — we noted this with the care team.',
        ])->assertOk()
            ->assertJsonPath('status', 'addressed')
            ->assertJsonPath('staff_response', 'Thank you — we noted this with the care team.')
            ->assertJsonPath('responded_by', $this->teacher->id);
    }

    public function test_parent_cannot_update_feedback_status(): void
    {
        Sanctum::actingAs($this->parent);

        $this->patchJson("/api/v1/parent-feedback/{$this->feedback->id}", [
            'status' => 'addressed',
        ])->assertForbidden();
    }
}
