<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\ChildDocument;
use App\Models\GalleryAlbum;
use App\Models\ProgressPhoto;
use App\Models\ProgressRecord;
use App\Models\User;
use App\Services\MediaStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChildGalleryTest extends TestCase
{
    use RefreshDatabase;

    private User $headDoctor;

    private User $parent;

    private Child $child;

    private string $disk;

    protected function setUp(): void
    {
        parent::setUp();

        config(['filesystems.private_media_disk' => 'local']);
        $this->disk = app(MediaStorage::class)->privateDiskName();
        Storage::fake($this->disk);

        $this->headDoctor = User::factory()->create([
            'username' => 'hd_gallery',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        $this->parent = User::factory()->create([
            'username' => 'parent_gallery',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Ava',
            'last_name' => 'Reyes',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    public function test_head_doctor_sees_albums_and_paginated_photos(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $record = ProgressRecord::create([
            'child_id' => $this->child->id,
            'recorded_by' => $this->headDoctor->id,
            'title' => 'Session photos',
            'recorded_on' => now()->toDateString(),
        ]);

        for ($i = 0; $i < 21; $i++) {
            $stored = app(MediaStorage::class)->storePrivate(
                UploadedFile::fake()->create("p{$i}.jpg", 10, 'image/jpeg'),
                'progress-photos/'.$record->id
            );
            ProgressPhoto::create([
                'progress_record_id' => $record->id,
                'uploaded_by' => $this->headDoctor->id,
                'original_filename' => "p{$i}.jpg",
                'mime_type' => 'image/jpeg',
                'size_bytes' => 1000,
                'disk' => $stored['disk'],
                'file_path' => $stored['path'],
                'sort_order' => $i,
            ]);
        }

        $pdfStored = app(MediaStorage::class)->storePrivate(
            UploadedFile::fake()->create('id.pdf', 20, 'application/pdf'),
            'child-documents/'.$this->child->id
        );
        ChildDocument::create([
            'child_id' => $this->child->id,
            'uploaded_by' => $this->headDoctor->id,
            'category' => 'other',
            'original_filename' => 'id.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 2000,
            'disk' => $pdfStored['disk'],
            'file_path' => $pdfStored['path'],
        ]);

        $imgStored = app(MediaStorage::class)->storePrivate(
            UploadedFile::fake()->create('pwd.png', 20, 'image/png'),
            'child-documents/'.$this->child->id
        );
        ChildDocument::create([
            'child_id' => $this->child->id,
            'uploaded_by' => $this->headDoctor->id,
            'category' => 'pwd_id',
            'original_filename' => 'pwd.png',
            'mime_type' => 'image/png',
            'size_bytes' => 1500,
            'disk' => $imgStored['disk'],
            'file_path' => $imgStored['path'],
        ]);

        $albums = $this->getJson('/api/v1/gallery/albums')
            ->assertOk()
            ->json();

        $album = collect($albums)->first(
            fn ($row) => ($row['kind'] ?? '') === 'auto' && (int) $row['child_id'] === $this->child->id
        );
        $this->assertNotNull($album);
        $this->assertSame(22, $album['photo_count']);
        $this->assertNotEmpty($album['cover']['download_path']);

        $page1 = $this->getJson("/api/v1/gallery/albums/{$this->child->id}?page=1&per_page=20")
            ->assertOk()
            ->assertJsonPath('kind', 'auto')
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 22)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonCount(20, 'items');

        $this->assertFalse(
            collect($page1->json('items'))->contains(fn ($item) => ($item['mime_type'] ?? '') === 'application/pdf')
        );

        $this->getJson("/api/v1/gallery/albums/{$this->child->id}?page=2&per_page=20")
            ->assertOk()
            ->assertJsonCount(2, 'items');
    }

    public function test_child_album_upload_appears_in_auto_gallery(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $upload = $this->post("/api/v1/gallery/albums/{$this->child->id}/photos", [
            'photos' => [
                UploadedFile::fake()->create('child-one.jpg', 20, 'image/jpeg'),
                UploadedFile::fake()->create('child-two.png', 20, 'image/png'),
            ],
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('album.child_id', $this->child->id)
            ->assertJsonCount(2, 'items');

        $this->assertDatabaseHas('gallery_albums', [
            'child_id' => $this->child->id,
        ]);

        $this->getJson("/api/v1/gallery/albums/{$this->child->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonCount(2, 'items');

        $albums = collect($this->getJson('/api/v1/gallery/albums')->assertOk()->json());
        $auto = $albums->first(
            fn ($row) => ($row['kind'] ?? '') === 'auto' && (int) $row['child_id'] === $this->child->id
        );
        $this->assertNotNull($auto);
        $this->assertSame(2, $auto['photo_count']);
        $this->assertFalse(
            $albums->contains(fn ($row) => ($row['kind'] ?? '') === 'custom' && isset($row['child_id']))
        );

        $photoId = $upload->json('items.0.id');
        $this->get("/api/v1/gallery-photos/{$photoId}/file")->assertOk();
    }

    public function test_facility_album_crud_upload_and_stream(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $created = $this->postJson('/api/v1/gallery/custom-albums', [
            'name' => 'Open house',
        ])
            ->assertCreated()
            ->assertJsonPath('kind', 'custom')
            ->assertJsonPath('name', 'Open house')
            ->assertJsonMissingPath('child_id')
            ->json();

        $albumId = $created['id'];
        $this->assertDatabaseHas('gallery_albums', [
            'id' => $albumId,
            'child_id' => null,
            'name' => 'Open house',
        ]);

        $this->patchJson("/api/v1/gallery/custom-albums/{$albumId}", [
            'name' => 'Facility events',
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Facility events');

        $upload = $this->post("/api/v1/gallery/custom-albums/{$albumId}/photos", [
            'photos' => [
                UploadedFile::fake()->create('one.jpg', 20, 'image/jpeg'),
                UploadedFile::fake()->create('two.png', 20, 'image/png'),
            ],
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonCount(2, 'items');

        $photoId = $upload->json('items.0.id');
        $this->assertNotEmpty($upload->json('items.0.download_path'));

        $this->getJson("/api/v1/gallery/custom-albums/{$albumId}/photos")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonCount(2, 'items')
            ->assertJsonMissingPath('child');

        $albums = collect($this->getJson('/api/v1/gallery/albums')->assertOk()->json());
        $this->assertTrue($albums->contains(fn ($row) => ($row['kind'] ?? '') === 'custom' && (int) $row['id'] === $albumId));
        $this->assertTrue($albums->contains(fn ($row) => ($row['kind'] ?? '') === 'auto' && (int) $row['child_id'] === $this->child->id));

        $this->get("/api/v1/gallery-photos/{$photoId}/file")
            ->assertOk();

        $this->deleteJson("/api/v1/gallery/custom-albums/{$albumId}")
            ->assertOk();

        $this->assertDatabaseMissing('gallery_albums', ['id' => $albumId]);
        $this->assertDatabaseMissing('gallery_photos', ['id' => $photoId]);
    }

    public function test_custom_album_upload_rejects_invalid_files(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $album = GalleryAlbum::create([
            'child_id' => null,
            'created_by' => $this->headDoctor->id,
            'name' => 'Docs',
        ]);

        $this->post("/api/v1/gallery/custom-albums/{$album->id}/photos", [
            'photos' => [
                UploadedFile::fake()->create('note.pdf', 20, 'application/pdf'),
            ],
        ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_parent_cannot_access_gallery_api(): void
    {
        Sanctum::actingAs($this->parent);

        $album = GalleryAlbum::create([
            'child_id' => null,
            'created_by' => $this->headDoctor->id,
            'name' => 'Private',
        ]);

        $this->getJson('/api/v1/gallery/albums')->assertForbidden();
        $this->getJson("/api/v1/gallery/albums/{$this->child->id}")->assertForbidden();
        $this->postJson('/api/v1/gallery/custom-albums', [
            'name' => 'Nope',
        ])->assertForbidden();
        $this->getJson("/api/v1/gallery/custom-albums/{$album->id}/photos")->assertForbidden();
    }
}
