<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\DiagnosisHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DiagnosisHistoryTest extends TestCase
{
    use RefreshDatabase;

    private Child $child;

    private User $psycho;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();

        $this->child = Child::create([
            'first_name' => 'Mia',
            'last_name' => 'Santos',
            'age_band' => 6,
            'diagnosis' => null,
            'is_active' => true,
        ]);

        $this->psycho = User::factory()->create([
            'username' => 'psycho_dx',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_dx',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
    }

    public function test_psychometrician_can_update_diagnosis_and_history_is_recorded(): void
    {
        Sanctum::actingAs($this->psycho);

        $this->patchJson("/api/v1/children/{$this->child->id}/diagnosis", [
            'diagnosis' => 'Under evaluation',
            'note' => 'Set after intake assessment',
        ])->assertOk()
            ->assertJsonPath('diagnosis', 'Under evaluation');

        $this->assertDatabaseHas('diagnosis_histories', [
            'child_id' => $this->child->id,
            'previous_diagnosis' => null,
            'new_diagnosis' => 'Under evaluation',
            'changed_by' => $this->psycho->id,
        ]);

        $this->getJson("/api/v1/children/{$this->child->id}/diagnosis-history")
            ->assertOk()
            ->assertJsonCount(1);
    }

    public function test_teacher_cannot_update_diagnosis(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->patchJson("/api/v1/children/{$this->child->id}/diagnosis", [
            'diagnosis' => 'ASD',
        ])->assertForbidden();

        $this->assertSame(0, DiagnosisHistory::query()->count());
    }

    public function test_child_update_records_diagnosis_history_when_changed(): void
    {
        Sanctum::actingAs($this->psycho);

        $this->putJson("/api/v1/children/{$this->child->id}", [
            'diagnosis' => 'ASD Level 1',
        ])->assertOk();

        $this->assertDatabaseHas('diagnosis_histories', [
            'child_id' => $this->child->id,
            'new_diagnosis' => 'ASD Level 1',
            'changed_by' => $this->psycho->id,
        ]);
    }
}
