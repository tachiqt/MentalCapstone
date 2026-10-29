<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_success_returns_token(): void
    {
        $user = User::factory()->create([
            'username' => 'teacher1',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        $response = $this->postJson('/api/v1/login', [
            'username' => 'teacher1',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_login_failure_returns_401(): void
    {
        User::factory()->create([
            'username' => 'teacher1',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        $response = $this->postJson('/api/v1/login', [
            'username' => 'teacher1',
            'password' => 'wrong-password',
        ]);

        $response->assertUnauthorized()
            ->assertJson(['message' => 'Invalid credentials.']);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = User::factory()->create([
            'username' => 'head1',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonPath('username', 'head1');
    }

    public function test_mobile_role_cannot_login_on_web_client(): void
    {
        User::factory()->create([
            'username' => 'teacher1',
            'role' => UserRole::Teacher,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->postJson('/api/v1/login', [
            'username' => 'teacher1',
            'password' => 'password',
            'client' => 'web',
        ])->assertForbidden()
            ->assertJsonFragment(['message' => 'This account is for the SmartCare mobile app. Teachers, caretakers, and parents cannot sign in on the web.']);
    }

    public function test_head_doctor_can_login_on_web_client(): void
    {
        $user = User::factory()->create([
            'username' => 'headdoctor1',
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->postJson('/api/v1/login', [
            'username' => 'headdoctor1',
            'password' => 'password',
            'client' => 'web',
        ])->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_psychometrician_can_login_on_web_client(): void
    {
        $user = User::factory()->create([
            'username' => 'psycho1',
            'role' => UserRole::Psychometrician,
            'status' => 'active',
            'password' => 'password',
        ]);

        $this->postJson('/api/v1/login', [
            'username' => 'psycho1',
            'password' => 'password',
            'client' => 'web',
        ])->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.role', UserRole::Psychometrician->value);
    }

    public function test_parent_cannot_create_users(): void
    {
        $parent = User::factory()->create([
            'username' => 'parent1',
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        Sanctum::actingAs($parent);

        $this->postJson('/api/v1/users', [
            'name' => 'New Staff',
            'username' => 'newstaff',
            'email' => 'newstaff@example.com',
            'password' => 'password',
            'role' => UserRole::Teacher->value,
        ])->assertForbidden();
    }
}
