<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Child;
use App\Models\User;
use App\Services\MediaStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChildDocumentTest extends TestCase
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
            'username' => 'hd_docs',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->parent = User::factory()->create([
            'username' => 'parent_docs',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->child = Child::create([
            'first_name' => 'Mia',
            'last_name' => 'Cruz',
            'diagnosis' => 'ASD',
            'is_active' => true,
        ]);
        $this->child->users()->attach($this->parent->id, ['relation' => 'parent']);
    }

    public function test_head_doctor_can_upload_list_and_download_document(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $file = UploadedFile::fake()->create('birth-cert.pdf', 200, 'application/pdf');

        $created = $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'birth_certificate',
            'title' => 'Birth certificate',
            'file' => $file,
        ], ['Accept' => 'application/json']);

        $created->assertCreated()
            ->assertJsonPath('category', 'birth_certificate')
            ->assertJsonPath('title', 'Birth certificate')
            ->assertJsonMissingPath('file_url');

        $path = $created->json('file_path');
        $this->assertNotEmpty($path);
        Storage::disk($this->disk)->assertExists($path);

        $this->getJson("/api/v1/children/{$this->child->id}/documents")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.download_path', "/children/{$this->child->id}/documents/{$created->json('id')}/file");

        $this->get("/api/v1/children/{$this->child->id}/documents/{$created->json('id')}/file")
            ->assertOk();
    }

    public function test_parent_cannot_access_documents(): void
    {
        Sanctum::actingAs($this->headDoctor);
        $file = UploadedFile::fake()->image('pwd.jpg', 300, 300);
        $created = $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'pwd_id',
            'file' => $file,
        ], ['Accept' => 'application/json'])->assertCreated();

        Sanctum::actingAs($this->parent);

        $this->getJson("/api/v1/children/{$this->child->id}/documents")->assertForbidden();
        $this->get("/api/v1/children/{$this->child->id}/documents/{$created->json('id')}/file")->assertForbidden();
        $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'other',
            'file' => UploadedFile::fake()->image('x.jpg'),
        ], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_rejects_oversized_and_invalid_document_types(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'other',
            'file' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'other',
            'file' => UploadedFile::fake()->create('huge.pdf', 11000, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_head_doctor_can_replace_and_delete_document(): void
    {
        Sanctum::actingAs($this->headDoctor);

        $created = $this->post("/api/v1/children/{$this->child->id}/documents", [
            'category' => 'other',
            'file' => UploadedFile::fake()->image('old.png', 200, 200),
        ], ['Accept' => 'application/json'])->assertCreated();

        $oldPath = $created->json('file_path');
        $id = $created->json('id');

        $this->post("/api/v1/children/{$this->child->id}/documents/{$id}", [
            'file' => UploadedFile::fake()->create('new.pdf', 40, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('original_filename', 'new.pdf');

        Storage::disk($this->disk)->assertMissing($oldPath);

        $this->deleteJson("/api/v1/children/{$this->child->id}/documents/{$id}")
            ->assertOk();

        $this->assertDatabaseMissing('child_documents', ['id' => $id]);
    }
}
