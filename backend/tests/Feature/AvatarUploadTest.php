<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AvatarUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['filesystems.avatars_disk' => 'public']);
    }

    public function test_head_doctor_can_upload_and_remove_avatar(): void
    {
        $user = User::factory()->create([
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        $response = $this->post('/api/v1/me/avatar', [
            'photo' => UploadedFile::fake()->image('doctor.jpg', 400, 400),
        ]);

        $response->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonStructure(['avatar_url']);

        $user->refresh();
        $this->assertNotNull($user->avatar_path);
        Storage::disk('public')->assertExists($user->avatar_path);

        $this->delete('/api/v1/me/avatar')
            ->assertOk()
            ->assertJsonPath('avatar_url', null);

        $user->refresh();
        $this->assertNull($user->avatar_path);
    }

    public function test_parent_cannot_upload_avatar(): void
    {
        $user = User::factory()->create([
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        $this->post('/api/v1/me/avatar', [
            'photo' => UploadedFile::fake()->image('parent.jpg', 400, 400),
        ])->assertForbidden();
    }
}
