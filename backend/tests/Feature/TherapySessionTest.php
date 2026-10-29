<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\Child;
use App\Models\TherapyPlan;
use App\Models\TherapySession;
use App\Models\User;
use App\Models\WorkspaceSetting;
use App\Services\ScheduleSuggestionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TherapySessionTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $teacher;

    private User $parent;

    private Child $child;

    protected function setUp(): void
    {
        parent::setUp();

        WorkspaceSetting::putValue('timezone', 'Asia/Manila');

        $this->headDoctor = User::factory()->create([
            'username' => 'head_therapy',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_therapy',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_therapy',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'age_band' => 6,
            'is_active' => true,
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    private function facilitySlot(string $time = '10:00', int $daysFromNow = 1): string
    {
        return Carbon::now('Asia/Manila')
            ->addDays($daysFromNow)
            ->setTimeFromTimeString($time)
            ->utc()
            ->toIso8601String();
    }

    public function test_teacher_can_schedule_session(): void
    {
        Sanctum::actingAs($this->teacher);

        $when = $this->facilitySlot('10:00');

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $when,
            'duration_minutes' => 45,
        ])->assertCreated()
            ->assertJsonPath('child_id', $this->child->id)
            ->assertJsonPath('teacher_id', $this->teacher->id)
            ->assertJsonPath('status', 'scheduled')
            ->assertJsonPath('duration_minutes', 45);

        $this->assertDatabaseHas('therapy_sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_teacher_cannot_schedule_outside_operating_hours(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $this->facilitySlot('21:00'),
            'duration_minutes' => 45,
        ])->assertStatus(422);
    }

    public function test_teacher_teacher_id_is_forced_to_self(): void
    {
        $otherTeacher = User::factory()->create([
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        Sanctum::actingAs($this->teacher);

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $otherTeacher->id,
            'scheduled_at' => $this->facilitySlot('09:00'),
            'duration_minutes' => 45,
        ])->assertCreated()
            ->assertJsonPath('teacher_id', $this->teacher->id);
    }

    public function test_head_doctor_cannot_schedule_session(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $this->facilitySlot('10:00'),
            'duration_minutes' => 45,
        ])->assertForbidden();
    }

    public function test_teacher_can_reschedule_session(): void
    {
        Sanctum::actingAs($this->teacher);
        $session = $this->makeSession();
        $next = $this->facilitySlot('14:00', 2);

        $this->putJson("/api/v1/therapy-sessions/{$session->id}", [
            'scheduled_at' => $next,
            'duration_minutes' => 90,
        ])->assertOk()
            ->assertJsonPath('duration_minutes', 90);
    }

    public function test_teacher_can_complete_session_with_outcomes(): void
    {
        Sanctum::actingAs($this->teacher);
        $session = $this->makeSession();

        $this->putJson("/api/v1/therapy-sessions/{$session->id}", [
            'status' => 'completed',
            'participation' => 'engaged',
            'observations' => 'Followed two-step prompts.',
            'outcomes' => 'Named three objects independently.',
            'intervention_notes' => 'Visual schedule and first-then board.',
        ])->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('participation', 'engaged')
            ->assertJsonPath('outcomes', 'Named three objects independently.');
    }

    public function test_teacher_can_cancel_session(): void
    {
        Sanctum::actingAs($this->teacher);
        $session = $this->makeSession();

        $this->putJson("/api/v1/therapy-sessions/{$session->id}", [
            'status' => 'cancelled',
        ])->assertOk()
            ->assertJsonPath('status', 'cancelled');

        $this->assertDatabaseHas('therapy_sessions', [
            'id' => $session->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_teacher_can_delete_session(): void
    {
        Sanctum::actingAs($this->teacher);
        $session = $this->makeSession(['status' => 'completed']);

        $this->deleteJson("/api/v1/therapy-sessions/{$session->id}")
            ->assertOk();

        $this->assertDatabaseMissing('therapy_sessions', ['id' => $session->id]);
    }

    public function test_suggest_returns_weekday_slots_for_teacher(): void
    {
        Sanctum::actingAs($this->teacher);

        $response = $this->postJson('/api/v1/therapy-sessions/suggest', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'start_date' => Carbon::now('Asia/Manila')->next('Monday')->toDateString(),
            'sessions_per_week' => 2,
            'duration_minutes' => 60,
            'days' => [1, 2, 3, 4, 5],
        ]);

        $response->assertOk()
            ->assertJsonCount(4, 'suggested_slots');

        $slots = $response->json('suggested_slots');
        $this->assertNotEmpty($slots[0]['scheduled_at']);

        foreach ($slots as $slot) {
            $hour = (int) Carbon::parse($slot['scheduled_at'])->timezone('Asia/Manila')->format('G');
            $this->assertGreaterThanOrEqual(7, $hour);
            $this->assertLessThan(17, $hour);
        }
    }

    public function test_suggest_includes_planned_activity_from_ai_plan(): void
    {
        Sanctum::actingAs($this->teacher);

        $rec = AiRecommendation::create([
            'child_id' => $this->child->id,
            'status' => 'approved',
            'openai_response_json' => [
                'suggested_activities' => [
                    ['title' => 'Choice board practice'],
                    ['title' => 'Turn-taking game'],
                ],
            ],
        ]);

        $plan = TherapyPlan::create([
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'ai_recommendation_id' => $rec->id,
            'title' => 'Communication plan',
            'sessions_per_week' => 2,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/therapy-sessions/suggest', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'therapy_plan_id' => $plan->id,
            'start_date' => Carbon::now('Asia/Manila')->next('Monday')->toDateString(),
            'sessions_per_week' => 2,
            'duration_minutes' => 60,
            'days' => [1, 2, 3, 4, 5],
        ]);

        $response->assertOk();
        $slots = $response->json('suggested_slots');
        $this->assertNotEmpty($slots);
        $this->assertSame('Choice board practice', $slots[0]['planned_activity']);
        $this->assertSame('Choice board practice', $slots[0]['intervention_notes']);
        $this->assertSame('Turn-taking game', $slots[1]['planned_activity']);
        $this->assertSame($plan->id, $slots[0]['therapy_plan_id']);
    }

    public function test_head_doctor_can_list_session_history(): void
    {
        Sanctum::actingAs($this->headDoctor);
        $this->makeSession(['status' => 'completed']);
        $this->makeSession(['status' => 'scheduled']);

        $this->getJson('/api/v1/therapy-sessions')
            ->assertOk()
            ->assertJsonCount(2);
    }

    public function test_parent_cannot_see_unassigned_child_sessions(): void
    {
        $otherChild = Child::create([
            'first_name' => 'Sam',
            'last_name' => 'Cruz',
            'age_band' => 7,
            'is_active' => true,
        ]);

        TherapySession::create([
            'child_id' => $otherChild->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => Carbon::parse($this->facilitySlot('10:00')),
            'duration_minutes' => 60,
            'status' => 'scheduled',
        ]);

        Sanctum::actingAs($this->parent);

        $this->getJson('/api/v1/therapy-sessions')
            ->assertOk()
            ->assertJsonCount(0);
    }

    public function test_psychometrician_cannot_create_session(): void
    {
        $psycho = User::factory()->create([
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);
        Sanctum::actingAs($psycho);

        $this->postJson('/api/v1/therapy-sessions', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => $this->facilitySlot('10:00'),
        ])->assertForbidden();
    }

    public function test_teacher_can_list_plans_for_assigned_child(): void
    {
        TherapyPlan::create([
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'title' => 'Language play',
            'sessions_per_week' => 2,
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->teacher);

        $this->getJson('/api/v1/therapy-plans')
            ->assertOk()
            ->assertJsonPath('0.title', 'Language play');
    }

    public function test_operating_hours_helper_rejects_evening(): void
    {
        $this->assertTrue(ScheduleSuggestionService::isWithinOperatingHours('07:00'));
        $this->assertTrue(ScheduleSuggestionService::isWithinOperatingHours('16:00'));
        $this->assertFalse(ScheduleSuggestionService::isWithinOperatingHours('17:00'));
        $this->assertFalse(ScheduleSuggestionService::isWithinOperatingHours('21:00'));
    }

    private function makeSession(array $overrides = []): TherapySession
    {
        return TherapySession::create(array_merge([
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => Carbon::parse($this->facilitySlot('10:00')),
            'duration_minutes' => 60,
            'status' => 'scheduled',
        ], $overrides));
    }
}
