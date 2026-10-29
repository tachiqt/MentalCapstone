<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\Notification;
use App\Models\TherapySession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkspaceHubTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private Child $child;

    protected function setUp(): void
    {
        parent::setUp();

        $this->headDoctor = User::factory()->create([
            'username' => 'hub_head',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->child = Child::create([
            'first_name' => 'Lina',
            'last_name' => 'Santos',
            'diagnosis' => 'speech delay',
            'is_active' => true,
        ]);
    }

    public function test_search_finds_children_sessions_and_staff(): void
    {
        $teacher = User::factory()->create([
            'name' => 'Mara Teacher',
            'username' => 'mara_t',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        TherapySession::create([
            'child_id' => $this->child->id,
            'teacher_id' => $teacher->id,
            'scheduled_at' => now()->addDay(),
            'duration_minutes' => 45,
            'status' => 'scheduled',
        ]);

        Sanctum::actingAs($this->headDoctor);

        $this->getJson('/api/v1/search?q=Lina')
            ->assertOk()
            ->assertJsonPath('children.0.last_name', 'Santos');

        $this->getJson('/api/v1/search?q=Mara')
            ->assertOk()
            ->assertJsonPath('staff.0.username', 'mara_t')
            ->assertJsonPath('sessions.0.child_id', $this->child->id);
    }

    public function test_creating_a_child_notifies_web_staff(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->postJson('/api/v1/children', [
            'first_name' => 'Noel',
            'last_name' => 'Cruz',
            'is_active' => true,
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->headDoctor->id,
            'type' => 'record.child',
            'title' => 'Child record added',
        ]);
    }

    public function test_due_therapy_session_creates_schedule_notification(): void
    {
        $teacher = User::factory()->create([
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        TherapySession::create([
            'child_id' => $this->child->id,
            'teacher_id' => $teacher->id,
            'scheduled_at' => now()->subMinutes(5),
            'duration_minutes' => 60,
            'status' => 'scheduled',
        ]);

        Sanctum::actingAs($this->headDoctor);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('unread', 1)
            ->assertJsonPath('notifications.0.type', 'schedule.therapy');
    }

    public function test_user_can_update_profile_and_password(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->putJson('/api/v1/me', [
            'name' => 'Dr. Head',
            'email' => 'head.hub@example.com',
            'username' => 'hub_head',
            'phone' => '09170001111',
        ])->assertOk()
            ->assertJsonPath('user.name', 'Dr. Head')
            ->assertJsonPath('user.phone', '09170001111');

        $this->putJson('/api/v1/me/password', [
            'current_password' => 'password',
            'password' => 'newpass12',
            'password_confirmation' => 'newpass12',
        ])->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('newpass12', $this->headDoctor->fresh()->password));
    }

    public function test_head_doctor_can_update_workspace_settings(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->putJson('/api/v1/workspace', [
            'facility_name' => 'Malvar Therapy Hub',
            'timezone' => 'Asia/Manila',
            'default_session_minutes' => 45,
            'reminder_lead_minutes' => 10,
        ])->assertOk()
            ->assertJsonPath('facility_name', 'Malvar Therapy Hub')
            ->assertJsonPath('default_session_minutes', '45');
    }

    public function test_notification_can_be_marked_read(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $note = Notification::create([
            'user_id' => $this->headDoctor->id,
            'type' => 'record.child',
            'title' => 'Child record added',
            'body' => 'Noel Cruz was added.',
        ]);

        $this->patchJson('/api/v1/notifications/'.$note->id.'/read')
            ->assertOk();

        $this->assertNotNull($note->fresh()->read_at);
    }
}
