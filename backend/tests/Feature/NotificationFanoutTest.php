<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\MedicationSchedule;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationFanoutTest extends TestCase
{
    use RefreshDatabase;

    private Child $child;

    private User $teacher;

    private User $caretaker;

    private User $parent;

    private User $head;

    protected function setUp(): void
    {
        parent::setUp();

        $this->child = Child::create([
            'first_name' => 'Jamie',
            'last_name' => 'Lee',
            'age_band' => 8,
            'is_active' => true,
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_notif',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->caretaker = User::factory()->create([
            'username' => 'caretaker_notif',
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_notif',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->head = User::factory()->create([
            'username' => 'head_notif',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->caretaker->id, ['relation' => 'caretaker']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    public function test_caretaker_dose_log_notifies_teacher_and_parent_but_not_the_caretaker(): void
    {
        $schedule = MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'time_of_day' => '20:00:00',
            'is_active' => true,
        ]);

        Notification::query()->delete();

        Sanctum::actingAs($this->caretaker);

        $this->postJson('/api/v1/medication-logs', [
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'status' => 'given',
            'administered_at' => now()->toIso8601String(),
        ])->assertCreated();

        $recipients = Notification::query()
            ->where('type', 'record.medication_log')
            ->pluck('user_id')
            ->all();

        $this->assertContains($this->teacher->id, $recipients);
        $this->assertContains($this->parent->id, $recipients);
        $this->assertContains($this->head->id, $recipients);
        $this->assertNotContains($this->caretaker->id, $recipients);
    }

    public function test_unlinked_users_are_not_notified_about_a_child_they_cannot_see(): void
    {
        $stranger = User::factory()->create([
            'username' => 'teacher_stranger',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        Notification::query()->delete();

        Sanctum::actingAs($this->head);

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Cetirizine',
            'dosage' => '5mg',
            'time_of_day' => '08:00',
        ])->assertCreated();

        $recipients = Notification::query()
            ->where('type', 'record.medication')
            ->pluck('user_id')
            ->all();

        $this->assertContains($this->caretaker->id, $recipients);
        $this->assertNotContains($stranger->id, $recipients);
    }

    public function test_assigning_a_child_notifies_the_assigned_user(): void
    {
        $newTeacher = User::factory()->create([
            'username' => 'teacher_assigned',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        Notification::query()->delete();

        Sanctum::actingAs($this->head);

        $this->postJson("/api/v1/children/{$this->child->id}/assign", [
            'user_id' => $newTeacher->id,
            'relation' => 'teacher',
        ])->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $newTeacher->id,
            'type' => 'record.assignment',
        ]);
    }
}
