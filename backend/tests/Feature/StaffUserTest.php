<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffUserTest extends TestCase
{
    use RefreshDatabase;

    private function headDoctor(): User
    {
        return User::factory()->create([
            'username' => 'headdoctor',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
    }

    public function test_head_doctor_can_list_staff_with_analytics(): void
    {
        $head = $this->headDoctor();
        User::factory()->create([
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $this->getJson('/api/v1/users')
            ->assertOk()
            ->assertJsonPath('analytics.total', 2)
            ->assertJsonPath('analytics.by_role.psychometrician', 1)
            ->assertJsonStructure(['users', 'analytics']);

        // Recent activity is its own endpoint rather than part of the staff payload.
        $this->getJson('/api/v1/activity-logs')->assertOk();
    }

    public function test_head_doctor_can_change_registered_user_role(): void
    {
        $head = $this->headDoctor();
        $newbie = User::factory()->create([
            'name' => 'New Register',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $this->putJson("/api/v1/users/{$newbie->id}", [
            'role' => UserRole::Teacher->value,
        ])->assertOk()
            ->assertJsonPath('role', UserRole::Teacher->value);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.role_changed',
            'subject_id' => $newbie->id,
        ]);
    }

    public function test_head_doctor_can_reset_password(): void
    {
        $head = $this->headDoctor();
        $user = User::factory()->create([
            'role' => UserRole::Teacher,
            'password' => 'password',
        ]);
        Sanctum::actingAs($head);

        $this->postJson("/api/v1/users/{$user->id}/reset-password", [
            'password' => 'Newpass12',
            'password_confirmation' => 'Newpass12',
        ])->assertOk();

        $this->assertTrue(Hash::check('Newpass12', $user->fresh()->password));
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.password_reset',
            'subject_id' => $user->id,
        ]);
    }

    public function test_head_doctor_can_delete_user(): void
    {
        $head = $this->headDoctor();
        $user = User::factory()->create(['role' => UserRole::Caretaker]);
        Sanctum::actingAs($head);

        $this->deleteJson("/api/v1/users/{$user->id}")->assertOk();
        $this->assertSoftDeleted('users', ['id' => $user->id]);
    }

    public function test_head_doctor_cannot_delete_self(): void
    {
        $head = $this->headDoctor();
        User::factory()->create(['role' => UserRole::HeadDoctor, 'status' => 'active']);
        Sanctum::actingAs($head);

        $this->deleteJson("/api/v1/users/{$head->id}")->assertStatus(422);
    }

    public function test_cannot_remove_last_head_doctor_role(): void
    {
        $head = $this->headDoctor();
        Sanctum::actingAs($head);

        $this->putJson("/api/v1/users/{$head->id}", [
            'role' => UserRole::Teacher->value,
        ])->assertStatus(422);
    }

    public function test_psychometrician_cannot_manage_users(): void
    {
        $user = User::factory()->create(['role' => UserRole::Psychometrician]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/users')->assertForbidden();
    }

    public function test_head_doctor_can_recreate_account_after_soft_delete(): void
    {
        $head = $this->headDoctor();
        $deleted = User::factory()->create([
            'name' => 'Former Teacher',
            'email' => 'former.teacher@smartcare.local',
            'username' => 'former_teacher',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        $deleted->delete();
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'New Teacher',
            'email' => 'former.teacher@smartcare.local',
            'username' => 'former_teacher',
            'password' => 'TempPass1',
            'password_confirmation' => 'TempPass1',
            'role' => UserRole::Teacher->value,
        ])->assertCreated()
            ->assertJsonPath('email', 'former.teacher@smartcare.local')
            ->assertJsonPath('username', 'former_teacher')
            ->assertJsonPath('name', 'New Teacher');

        $this->assertDatabaseHas('users', [
            'id' => $deleted->id,
            'email' => 'former.teacher@smartcare.local',
            'username' => 'former_teacher',
            'name' => 'New Teacher',
            'deleted_at' => null,
        ]);
    }

    public function test_head_doctor_can_create_staff_account(): void
    {
        $head = $this->headDoctor();
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Fresh Teacher',
            'email' => 'fresh.teacher@smartcare.local',
            'username' => 'fresh_teacher',
            'password' => 'TempPass1',
            'password_confirmation' => 'TempPass1',
            'role' => UserRole::Teacher->value,
        ])->assertCreated()
            ->assertJsonPath('role', UserRole::Teacher->value)
            ->assertJsonStructure(['verification_url', 'mail_sent', 'message']);
    }

    public function test_head_doctor_can_create_staff_with_dotted_username(): void
    {
        $head = $this->headDoctor();
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Dotted User',
            'email' => 'dotted.user@smartcare.local',
            'username' => 'john.doe-1',
            'password' => 'TempPass1',
            'password_confirmation' => 'TempPass1',
            'role' => UserRole::Psychometrician->value,
        ])->assertCreated()
            ->assertJsonPath('username', 'john.doe-1');
    }

    public function test_username_cannot_contain_spaces_or_at(): void
    {
        $head = $this->headDoctor();
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/users', [
            'name' => 'Bad User',
            'email' => 'bad.user@smartcare.local',
            'username' => 'john doe',
            'password' => 'TempPass1',
            'password_confirmation' => 'TempPass1',
            'role' => UserRole::Teacher->value,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }
}
