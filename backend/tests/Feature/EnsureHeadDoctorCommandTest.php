<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EnsureHeadDoctorCommandTest extends TestCase
{
    use RefreshDatabase;

    private const EMAIL = 'smartcare102030@gmail.com';

    private const USERNAME = 'markvincent';

    public function test_it_creates_the_head_doctor_when_missing(): void
    {
        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        $user = User::where('email', self::EMAIL)->firstOrFail();
        $this->assertSame(UserRole::HeadDoctor, $user->role);
        $this->assertSame('active', $user->status);
        $this->assertNotNull($user->email_verified_at);
    }

    /**
     * The command runs on every container start, so a profile edit must survive
     * it. This is the regression that made renames silently revert on cold start.
     */
    public function test_it_preserves_a_renamed_profile(): void
    {
        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        $user = User::where('email', self::EMAIL)->firstOrFail();
        $user->update([
            'name' => 'Dr. Renamed Owner',
            'username' => 'renamedowner',
            'password' => 'MyOwnPassword1',
        ]);

        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        $user->refresh();
        $this->assertSame('Dr. Renamed Owner', $user->name);
        $this->assertSame('renamedowner', $user->username);
        $this->assertTrue(Hash::check('MyOwnPassword1', $user->password));
    }

    public function test_it_repairs_access_without_touching_the_profile(): void
    {
        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        $user = User::where('email', self::EMAIL)->firstOrFail();
        $user->update(['name' => 'Kept Name', 'status' => 'inactive', 'role' => UserRole::Teacher]);
        $user->delete();

        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        $user = User::withTrashed()->where('email', self::EMAIL)->firstOrFail();
        $this->assertNull($user->deleted_at);
        $this->assertSame('active', $user->status);
        $this->assertSame(UserRole::HeadDoctor, $user->role);
        $this->assertSame('Kept Name', $user->name);
    }

    public function test_reset_flag_restores_the_documented_credentials(): void
    {
        $this->artisan('smartcare:ensure-head-doctor')->assertSuccessful();

        User::where('email', self::EMAIL)->firstOrFail()->update([
            'name' => 'Locked Out',
            'username' => 'lockedout',
        ]);

        $this->artisan('smartcare:ensure-head-doctor --reset')->assertSuccessful();

        $user = User::where('email', self::EMAIL)->firstOrFail();
        $this->assertSame('Mark Vincent Perez', $user->name);
        $this->assertSame(self::USERNAME, $user->username);
        $this->assertTrue(Hash::check('Smartcare123', $user->password));
    }
}
