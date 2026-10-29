<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\AssessmentChecklist;
use App\Models\ChecklistItem;
use App\Models\Child;
use App\Models\TherapyPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AssessmentAiFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $psychometrician;

    private User $teacher;

    private Child $child;

    private AssessmentChecklist $checklist;

    private ChecklistItem $checklistItem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->headDoctor = User::factory()->create([
            'username' => 'head_doctor',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->psychometrician = User::factory()->create([
            'username' => 'psych1',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        $this->teacher = User::factory()->create([
            'username' => 'teacher1',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'age_band' => 6,
            'is_active' => true,
        ]);

        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);

        $this->checklist = AssessmentChecklist::create([
            'title' => 'Developmental screening',
            'description' => 'Baseline checklist',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        $this->checklistItem = ChecklistItem::create([
            'assessment_checklist_id' => $this->checklist->id,
            'prompt' => 'Follows two-step instructions',
            'domain' => 'communication',
            'sort_order' => 1,
        ]);
    }

    public function test_assessment_generate_review_creates_therapy_plan(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $assessmentResponse = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'moderate',
            'conditions_json' => ['autism_spectrum'],
            'notes' => 'Initial assessment completed.',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '2',
                    'comment' => 'Needs prompting',
                ],
            ],
        ]);

        $assessmentResponse->assertCreated()
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('ai_generation_status', 'none');

        $assessmentId = $assessmentResponse->json('id');

        $recommendationResponse = $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ]);

        $recommendationResponse->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $recommendationId = $recommendationResponse->json('id');

        Sanctum::actingAs($this->teacher);

        $reviewResponse = $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'approved',
            'teacher_notes' => 'Plan aligns with classroom goals.',
        ]);

        $reviewResponse->assertOk()
            ->assertJsonPath('status', 'approved');

        $this->assertDatabaseHas('ai_recommendations', [
            'id' => $recommendationId,
            'status' => 'approved',
            'reviewed_by' => $this->teacher->id,
        ]);

        $this->assertDatabaseHas('therapy_plans', [
            'child_id' => $this->child->id,
            'teacher_id' => $this->teacher->id,
            'ai_recommendation_id' => $recommendationId,
            'status' => 'active',
        ]);

        $recommendation = AiRecommendation::findOrFail($recommendationId);
        $this->assertNotNull($recommendation->therapyPlan);
        $this->assertInstanceOf(TherapyPlan::class, $recommendation->therapyPlan);
    }

    public function test_teacher_can_read_assessments_and_generate_ai(): void
    {
        Sanctum::actingAs($this->psychometrician);

        $assessmentId = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'mild',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '2',
                ],
            ],
        ])->assertCreated()
            ->json('id');

        Sanctum::actingAs($this->teacher);

        $this->getJson('/api/v1/assessments')
            ->assertOk()
            ->assertJsonPath('0.id', $assessmentId)
            ->assertJsonPath('0.ai_generation_status', 'none');

        $this->getJson("/api/v1/assessments/{$assessmentId}")
            ->assertOk()
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('ai_generation_status', 'none');

        $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'responses' => [
                ['checklist_item_id' => $this->checklistItem->id, 'score' => '1'],
            ],
        ])->assertForbidden();

        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $this->getJson("/api/v1/assessments/{$assessmentId}")
            ->assertOk()
            ->assertJsonPath('ai_generation_status', 'pending_review');
    }

    public function test_teacher_can_modify_recommendation_with_materials(): void
    {
        [, $recommendationId] = $this->createPendingRecommendation();

        $material = \App\Models\LearningMaterial::create([
            'title' => 'Picture cards',
            'description' => 'Matching set',
            'type' => 'visual',
            'tags' => ['matching'],
            'uploaded_by' => $this->teacher->id,
        ]);

        Sanctum::actingAs($this->teacher);

        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'modified',
            'teacher_notes' => 'Adjusted focus for classroom carryover.',
            'openai_response_json' => [
                'developmental_summary' => 'Customized summary for the classroom.',
                'clinical_basis' => 'Teacher classroom observation plus assessment scores.',
                'focus_areas' => ['communication', 'turn taking'],
                'intervention_suggestions' => ['Use visual first/then board.'],
            ],
            'learning_material_ids' => [$material->id],
        ])
            ->assertOk()
            ->assertJsonPath('status', 'modified')
            ->assertJsonPath('openai_response_json.developmental_summary', 'Customized summary for the classroom.')
            ->assertJsonPath('openai_response_json.attached_materials.0.id', $material->id);

        $this->assertDatabaseHas('therapy_plans', [
            'ai_recommendation_id' => $recommendationId,
            'teacher_id' => $this->teacher->id,
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->headDoctor);
        $this->getJson("/api/v1/reports/children/{$this->child->id}")
            ->assertOk()
            ->assertJsonPath('recommended_materials.0.id', $material->id)
            ->assertJsonPath('recommended_materials.0.title', 'Picture cards');
    }

    public function test_teacher_can_unselect_suggested_learning_material(): void
    {
        [, $recommendationId] = $this->createPendingRecommendation();

        $keep = \App\Models\LearningMaterial::create([
            'title' => 'Keep me',
            'type' => 'guide',
            'uploaded_by' => $this->teacher->id,
        ]);
        $drop = \App\Models\LearningMaterial::create([
            'title' => 'Drop me',
            'type' => 'visual',
            'uploaded_by' => $this->teacher->id,
        ]);

        $recommendation = AiRecommendation::findOrFail($recommendationId);
        $payload = $recommendation->openai_response_json ?? [];
        $payload['suggested_activities'] = [
            [
                'title' => 'Use picture cards',
                'material_id' => $drop->id,
                'rationale' => 'AI suggested',
            ],
            [
                'title' => 'Follow the guide',
                'material_id' => $keep->id,
                'rationale' => 'AI suggested',
            ],
        ];
        $payload['learning_material_ids'] = [$drop->id, $keep->id];
        $payload['attached_materials'] = [
            ['id' => $drop->id, 'title' => $drop->title, 'type' => $drop->type],
            ['id' => $keep->id, 'title' => $keep->title, 'type' => $keep->type],
        ];
        $recommendation->update(['openai_response_json' => $payload]);

        Sanctum::actingAs($this->teacher);
        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'modified',
            'teacher_notes' => 'Removed one suggested material.',
            'learning_material_ids' => [$keep->id],
        ])
            ->assertOk()
            ->assertJsonPath('status', 'modified')
            ->assertJsonPath('openai_response_json.learning_material_ids', [$keep->id])
            ->assertJsonPath('openai_response_json.attached_materials.0.id', $keep->id);

        $updated = AiRecommendation::findOrFail($recommendationId)->fresh();
        $linkedIds = collect($updated->openai_response_json['suggested_activities'] ?? [])
            ->filter(fn ($a) => is_array($a) && ! empty($a['material_id']))
            ->pluck('material_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertContains($keep->id, $linkedIds);
        $this->assertNotContains($drop->id, $linkedIds);

        Sanctum::actingAs($this->headDoctor);
        $report = $this->getJson("/api/v1/reports/children/{$this->child->id}")->assertOk()->json();
        $recommendedIds = collect($report['recommended_materials'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all();
        $this->assertContains($keep->id, $recommendedIds);
        $this->assertNotContains($drop->id, $recommendedIds);
    }

    public function test_approved_recommendation_cannot_be_reviewed_again(): void
    {
        [$assessmentId, $recommendationId] = $this->createPendingRecommendation();

        Sanctum::actingAs($this->headDoctor);

        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'approved',
        ])->assertOk()->assertJsonPath('status', 'approved');

        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'rejected',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'This AI recommendation has already been reviewed and cannot be changed.');

        $this->assertDatabaseHas('ai_recommendations', [
            'id' => $recommendationId,
            'status' => 'approved',
        ]);
    }

    public function test_cannot_generate_another_recommendation_while_pending_or_approved(): void
    {
        [$assessmentId, $recommendationId] = $this->createPendingRecommendation();

        Sanctum::actingAs($this->psychometrician);
        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'This assessment already has an AI recommendation that is pending review or approved.');

        Sanctum::actingAs($this->headDoctor);
        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'approved',
        ])->assertOk();

        Sanctum::actingAs($this->psychometrician);
        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'This assessment already has an AI recommendation that is pending review or approved.');
    }

    public function test_rejected_recommendation_is_hidden_and_generate_is_allowed_again(): void
    {
        [$assessmentId, $recommendationId] = $this->createPendingRecommendation();

        Sanctum::actingAs($this->headDoctor);
        $this->postJson("/api/v1/recommendations/{$recommendationId}/review", [
            'status' => 'rejected',
        ])->assertOk()->assertJsonPath('status', 'rejected');

        $this->getJson("/api/v1/children/{$this->child->id}/recommendations")
            ->assertOk()
            ->assertJsonCount(0);

        $this->getJson("/api/v1/assessments/{$assessmentId}")
            ->assertOk()
            ->assertJsonPath('ai_recommendations', [])
            ->assertJsonPath('ai_generation_status', 'none');

        Sanctum::actingAs($this->psychometrician);
        $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated()
            ->assertJsonPath('status', 'pending_review');

        $this->getJson("/api/v1/children/{$this->child->id}/recommendations")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.status', 'pending_review');
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function createPendingRecommendation(): array
    {
        Sanctum::actingAs($this->psychometrician);

        $assessmentId = $this->postJson("/api/v1/children/{$this->child->id}/assessments", [
            'checklist_id' => $this->checklist->id,
            'severity_level' => 'moderate',
            'conditions_json' => ['autism_spectrum'],
            'notes' => 'Initial assessment completed.',
            'responses' => [
                [
                    'checklist_item_id' => $this->checklistItem->id,
                    'score' => '2',
                    'comment' => 'Needs prompting',
                ],
            ],
        ])->assertCreated()->json('id');

        $recommendationId = $this->postJson("/api/v1/children/{$this->child->id}/recommendations/generate", [
            'assessment_id' => $assessmentId,
        ])->assertCreated()->json('id');

        return [(int) $assessmentId, (int) $recommendationId];
    }
}
