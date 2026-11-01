<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\ProgressPhoto;
use App\Models\User;
use App\Services\MediaStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProgressPhotoTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $parent;

    private User $otherParent;

    private Child $child;

    private Child $otherChild;

    private string $disk;

    protected function setUp(): void
    {
        parent::setUp();

        config(['filesystems.private_media_disk' => 'local']);
        $this->disk = app(MediaStorage::class)->privateDiskName();
        Storage::fake($this->disk);

        $this->teacher = User::factory()->create([
            'username' => 'teacher_photos',
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);
        $this->parent = User::factory()->create([
            'username' => 'parent_photos',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);
        $this->otherParent = User::factory()->create([
            'username' => 'other_parent_photos',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Leo',
            'last_name' => 'Santos',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->child->users()->attach($this->teacher->id, ['relation' => 'teacher']);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);

        $this->otherChild = Child::create([
            'first_name' => 'Nina',
            'last_name' => 'Reyes',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->otherChild->users()->attach($this->otherParent->id, ['relation' => 'parent']);
    }

    public function test_can_create_progress_without_photos(): void
    {
        Sanctum::actingAs($this->teacher);

        $this->postJson("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Used PECS independently',
            'summary' => 'Requested snack with card.',
            'milestone' => 'Communication',
        ])
            ->assertCreated()
            ->assertJsonPath('title', 'Used PECS independently')
            ->assertJsonCount(0, 'photos');
    }

    public function test_teacher_can_attach_photos_and_parent_can_download(): void
    {
        Sanctum::actingAs($this->teacher);

        $created = $this->post("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Art activity',
            'summary' => 'Finished a painting',
            'photos' => [
                UploadedFile::fake()->image('art1.jpg', 400, 400),
                UploadedFile::fake()->image('art2.png', 400, 400),
            ],
        ], ['Accept' => 'application/json']);

        $created->assertCreated()->assertJsonCount(2, 'photos');
        $photoId = $created->json('photos.0.id');
        $path = $created->json('photos.0.file_path');
        Storage::disk($this->disk)->assertExists($path);

        Sanctum::actingAs($this->parent);
        $this->getJson("/api/v1/children/{$this->child->id}/progress")
            ->assertOk()
            ->assertJsonPath('0.photos.0.download_path', "/progress-photos/{$photoId}/file");

        $this->get("/api/v1/progress-photos/{$photoId}/file")->assertOk();
    }

    public function test_other_parent_cannot_download_photo(): void
    {
        Sanctum::actingAs($this->teacher);
        $created = $this->post("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Private moment',
            'photos' => [UploadedFile::fake()->image('secret.jpg', 200, 200)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $photoId = $created->json('photos.0.id');

        Sanctum::actingAs($this->otherParent);
        $this->get("/api/v1/progress-photos/{$photoId}/file")->assertNotFound();
        $this->getJson("/api/v1/children/{$this->child->id}/progress")->assertNotFound();
    }

    public function test_rejects_too_many_or_oversized_photos(): void
    {
        Sanctum::actingAs($this->teacher);

        $photos = [];
        for ($i = 0; $i < 7; $i++) {
            $photos[] = UploadedFile::fake()->image("p{$i}.jpg", 100, 100);
        }

        $this->post("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Too many',
            'photos' => $photos,
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Too big',
            'photos' => [UploadedFile::fake()->image('big.jpg')->size(6000)],
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_can_update_progress_adding_and_removing_photos(): void
    {
        Sanctum::actingAs($this->teacher);

        $created = $this->post("/api/v1/children/{$this->child->id}/progress", [
            'title' => 'Session recap',
            'photos' => [
                UploadedFile::fake()->image('a.jpg', 200, 200),
                UploadedFile::fake()->image('b.jpg', 200, 200),
            ],
        ], ['Accept' => 'application/json'])->assertCreated();

        $recordId = $created->json('id');
        $removeId = $created->json('photos.0.id');
        $keepId = $created->json('photos.1.id');

        $updated = $this->post("/api/v1/children/{$this->child->id}/progress/{$recordId}", [
            'title' => 'Session recap (edited)',
            'remove_photo_ids' => [$removeId],
            'photos' => [UploadedFile::fake()->image('c.jpg', 200, 200)],
        ], ['Accept' => 'application/json']);

        $updated->assertOk()
            ->assertJsonPath('title', 'Session recap (edited)')
            ->assertJsonCount(2, 'photos');

        $this->assertDatabaseMissing('progress_photos', ['id' => $removeId]);
        $this->assertDatabaseHas('progress_photos', ['id' => $keepId]);
        $this->assertSame(2, ProgressPhoto::where('progress_record_id', $recordId)->count());
    }
}
