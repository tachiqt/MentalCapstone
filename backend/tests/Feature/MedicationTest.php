<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\MedicationLog;
use App\Models\MedicationSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MedicationTest extends TestCase
{
    use RefreshDatabase;

    private Child $child;

    private User $teacher;

    private User $caretaker;

    private User $parent;

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
            'username' => 'teacher_med',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->caretaker = User::factory()->create([
            'username' => 'caretaker1',
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_med',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->caretaker->id, ['relation' => 'caretaker']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    public function test_teacher_can_create_medication_schedule(): void
    {
        Sanctum::actingAs($this->teacher);

        $response = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'instructions' => 'Give at bedtime',
            'time_of_day' => '20:00',
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
        ]);

        $response->assertCreated()
            ->assertJsonPath('medicine_name', 'Melatonin')
            ->assertJsonPath('child_id', $this->child->id);

        $this->assertDatabaseHas('medication_schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Melatonin',
            'created_by' => $this->teacher->id,
        ]);
    }

    public function test_caretaker_can_log_given_dose(): void
    {
        $schedule = MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'time_of_day' => '20:00:00',
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->caretaker);

        $response = $this->postJson('/api/v1/medication-logs', [
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'status' => 'given',
            'administered_at' => now()->toIso8601String(),
            'notes' => 'Taken with water',
        ]);

        $response->assertCreated()
            ->assertJsonPath('status', 'given')
            ->assertJsonPath('caretaker_id', $this->caretaker->id);

        $this->assertDatabaseHas('medication_logs', [
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'status' => 'given',
            'caretaker_id' => $this->caretaker->id,
        ]);

        $this->assertSame(1, MedicationLog::where('child_id', $this->child->id)->count());
    }

    public function test_parent_cannot_create_medication_schedule(): void
    {
        Sanctum::actingAs($this->parent);

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Ibuprofen',
            'dosage' => '100mg',
        ])->assertForbidden();

        $this->assertDatabaseCount('medication_schedules', 0);
    }

    public function test_teacher_can_edit_and_deactivate_schedule(): void
    {
        Sanctum::actingAs($this->teacher);

        $created = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Vitamin D',
            'dosage' => '400 IU',
            'times_of_day' => ['08:00'],
            'days_of_week' => [1, 2, 3, 4, 5],
        ])->assertCreated();

        $id = $created->json('id');

        $this->putJson("/api/v1/medication-schedules/{$id}", [
            'dosage' => '600 IU',
            'times_of_day' => ['08:00', '20:00'],
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('dosage', '600 IU')
            ->assertJsonPath('is_active', false);

        $this->assertDatabaseHas('medication_schedules', [
            'id' => $id,
            'dosage' => '600 IU',
            'is_active' => false,
        ]);
    }

    public function test_head_doctor_can_create_and_deactivate_schedule(): void
    {
        $head = User::factory()->create([
            'username' => 'head_med',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $created = $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Cetirizine',
            'dosage' => '5mg',
            'instructions' => 'Give after breakfast',
            'time_of_day' => '08:00',
            'days_of_week' => [1, 2, 3, 4, 5],
        ])->assertCreated()
            ->assertJsonPath('medicine_name', 'Cetirizine')
            ->assertJsonPath('is_active', true);

        $id = $created->json('id');

        $this->putJson("/api/v1/medication-schedules/{$id}", [
            'dosage' => '10mg',
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('dosage', '10mg')
            ->assertJsonPath('is_active', false);

        $this->assertDatabaseHas('medication_schedules', [
            'id' => $id,
            'dosage' => '10mg',
            'is_active' => false,
            'created_by' => $head->id,
        ]);
    }

    public function test_today_schedules_expand_times_for_mobile(): void
    {
        $schedule = MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'time_of_day' => '08:00:00',
            'times_of_day' => ['20:00', '08:00'],
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
            'is_active' => true,
        ]);

        MedicationLog::create([
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'given',
            'administered_at' => now()->startOfDay()->setTime(8, 5),
            'notes' => 'Taken with breakfast',
        ]);

        MedicationLog::create([
            'medication_schedule_id' => $schedule->id,
            'child_id' => $this->child->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'missed',
            'administered_at' => now()->startOfDay()->setTime(20, 10),
            'notes' => 'Asleep',
        ]);

        Sanctum::actingAs($this->caretaker);

        $this->getJson('/api/v1/medication-schedules?today=1')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.medication_name', 'Melatonin')
            ->assertJsonPath('0.scheduled_time', '08:00')
            ->assertJsonPath('0.time', '08:00')
            ->assertJsonPath('0.logged_today', true)
            ->assertJsonPath('0.status', 'given')
            ->assertJsonPath('1.scheduled_time', '20:00')
            ->assertJsonPath('1.time', '20:00')
            ->assertJsonPath('1.logged_today', true)
            ->assertJsonPath('1.status', 'missed');
    }

    public function test_parent_cannot_see_unassigned_child_schedules(): void
    {
        $otherChild = Child::create([
            'first_name' => 'Sam',
            'last_name' => 'Cruz',
            'age_band' => 7,
            'is_active' => true,
        ]);

        MedicationSchedule::create([
            'child_id' => $otherChild->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Hidden dose',
            'is_active' => true,
        ]);

        MedicationSchedule::create([
            'child_id' => $this->child->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Melatonin',
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->parent);

        $this->getJson('/api/v1/medication-schedules')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.medicine_name', 'Melatonin');
    }

    public function test_head_doctor_can_schedule_three_times_a_day(): void
    {
        $head = User::factory()->create([
            'username' => 'head_med_tid',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        Sanctum::actingAs($head);

        $this->postJson('/api/v1/medication-schedules', [
            'child_id' => $this->child->id,
            'medicine_name' => 'Amoxicillin',
            'dosage' => '250mg',
            'times_of_day' => ['08:00', '14:00', '20:00'],
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
        ])->assertCreated()
            ->assertJsonPath('times_of_day.0', '08:00')
            ->assertJsonPath('times_of_day.2', '20:00');
    }
}
