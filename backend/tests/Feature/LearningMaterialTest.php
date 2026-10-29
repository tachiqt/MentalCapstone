<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\LearningMaterial;
use App\Models\User;
use App\Services\MediaStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LearningMaterialTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $parent;

    private string $disk;

    protected function setUp(): void
    {
        parent::setUp();

        $this->disk = app(MediaStorage::class)->diskName();
        Storage::fake($this->disk);

        $this->headDoctor = User::factory()->create([
            'username' => 'head_materials',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_materials',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);
    }

    public function test_head_doctor_can_create_material_with_file(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $file = UploadedFile::fake()->create('picture-cards.pdf', 120, 'application/pdf');

        $response = $this->post('/api/v1/learning-materials', [
            'title' => 'Picture exchange cards',
            'description' => 'Visual prompts for requesting items.',
            'type' => 'visual',
            'tags' => ['communication', 'social'],
            'file' => $file,
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('title', 'Picture exchange cards')
            ->assertJsonPath('type', 'visual')
            ->assertJsonPath('tags.0', 'communication')
            ->assertJsonPath('uploaded_by', $this->headDoctor->id);

        $this->assertNotEmpty($response->json('file_url'));
        $this->assertNotEmpty($response->json('file_path'));
        Storage::disk($this->disk)->assertExists($response->json('file_path'));
    }

    public function test_index_includes_file_url(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $path = UploadedFile::fake()->create('guide.pdf', 40, 'application/pdf')
            ->store('learning-materials', $this->disk);

        LearningMaterial::create([
            'title' => 'Session guide',
            'type' => 'guide',
            'tags' => ['cognitive'],
            'file_path' => $path,
            'uploaded_by' => $this->headDoctor->id,
        ]);

        $this->getJson('/api/v1/learning-materials')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Session guide')
            ->assertJsonPath('0.file_url', Storage::disk($this->disk)->url($path));
    }

    public function test_head_doctor_can_update_material(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $material = LearningMaterial::create([
            'title' => 'Draft cards',
            'type' => 'visual',
            'tags' => ['social'],
            'uploaded_by' => $this->headDoctor->id,
        ]);

        $this->putJson("/api/v1/learning-materials/{$material->id}", [
            'title' => 'Updated cards',
            'type' => 'worksheet',
            'description' => 'Printable turn-taking sheet.',
            'tags' => ['cognitive'],
        ])->assertOk()
            ->assertJsonPath('title', 'Updated cards')
            ->assertJsonPath('type', 'worksheet')
            ->assertJsonPath('tags.0', 'cognitive');
    }

    public function test_head_doctor_can_soft_delete_material(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $material = LearningMaterial::create([
            'title' => 'Retired worksheet',
            'type' => 'worksheet',
            'tags' => [],
            'uploaded_by' => $this->headDoctor->id,
        ]);

        $this->deleteJson("/api/v1/learning-materials/{$material->id}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertSoftDeleted('learning_materials', ['id' => $material->id]);

        $this->getJson('/api/v1/learning-materials')
            ->assertOk()
            ->assertJsonCount(0);
    }

    public function test_parent_cannot_store_learning_material(): void
    {
        Sanctum::actingAs($this->parent);

        $this->postJson('/api/v1/learning-materials', [
            'title' => 'Should not save',
            'type' => 'guide',
        ])->assertForbidden();

        $this->assertDatabaseCount('learning_materials', 0);
    }
}
