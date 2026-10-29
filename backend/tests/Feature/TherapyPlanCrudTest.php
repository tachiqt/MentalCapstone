<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\TherapyPlan;
use App\Models\User;
use App\Models\WorkspaceSetting;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TherapyPlanCrudTest extends TestCase
{
    use RefreshDatabase;

    private Child $child;

    private User $teacher;

    private User $otherTeacher;

    protected function setUp(): void
    {
        parent::setUp();

        WorkspaceSetting::putValue('timezone', 'Asia/Manila');

        $this->child = Child::create([
            'first_name' => 'Ava',
            'last_name' => 'Cruz',
            'age_band' => 7,
            'is_active' => true,
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_plan',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->otherTeacher = User::factory()->create([
            'username' => 'teacher_other',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
    }

    public function test_teacher_can_create_and_update_therapy_plan_for_assigned_child(): void
    {
        Sanctum::actingAs($this->teacher);

        $create = $this->postJson('/api/v1/therapy-plans', [
            'child_id' => $this->child->id,
            'title' => 'Communication focus',
            'description' => 'Choice board practice',
            'sessions_per_week' => 3,
        ]);

        $create->assertCreated()
            ->assertJsonPath('title', 'Communication focus')
            ->assertJsonPath('child_id', $this->child->id)
            ->assertJsonPath('teacher_id', $this->teacher->id)
            ->assertJsonPath('status', 'active');

        $planId = $create->json('id');

        $update = $this->putJson("/api/v1/therapy-plans/{$planId}", [
            'title' => 'Communication focus (revised)',
            'sessions_per_week' => 2,
            'status' => 'archived',
        ]);

        $update->assertOk()
            ->assertJsonPath('title', 'Communication focus (revised)')
            ->assertJsonPath('sessions_per_week', 2)
            ->assertJsonPath('status', 'archived');
    }

    public function test_unassigned_teacher_cannot_create_plan_for_child(): void
    {
        Sanctum::actingAs($this->otherTeacher);

        // ChildAccess hides inaccessible children as 404 (not 403).
        $this->postJson('/api/v1/therapy-plans', [
            'child_id' => $this->child->id,
            'title' => 'Unauthorized plan',
        ])->assertNotFound();
    }

    public function test_session_rejects_therapy_plan_for_different_child(): void
    {
        $otherChild = Child::create([
            'first_name' => 'Ben',
            'last_name' => 'Reyes',
            'age_band' => 9,
            'is_active' => true,
        ]);
        $otherChild->users()->attach($this->teacher->id, ['relation' => 'teacher']);

        $plan = TherapyPlan::create([
            'child_id' => $otherChild->id,
            'teacher_id' => $this->teacher->id,
            'title' => 'Other child plan',
            'sessions_per_week' => 2,
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->teacher);

        $when = Carbon::now('Asia/Manila')
            ->addDay()
            ->setTime(10, 0)
            ->utc()
            ->toIso8601String();

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'therapy_plan_id' => $plan->id,
            'scheduled_at' => $when,
            'duration_minutes' => 60,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'The selected therapy plan does not belong to this child.');
    }
}
