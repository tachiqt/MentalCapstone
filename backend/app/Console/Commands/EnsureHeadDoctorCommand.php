<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Command;

class EnsureHeadDoctorCommand extends Command
{
    protected $signature = 'smartcare:ensure-head-doctor
        {--email=smartcare102030@gmail.com}
        {--name=Mark Vincent Perez}
        {--username=markvincent}
        {--password=Smartcare123}
        {--reset : Overwrite the name, username, email and password of an existing account}';

    protected $description = 'Guarantee the production Head Doctor account exists and can sign in';

    /**
     * This runs from docker/entrypoint.sh on every container start, so it must be
     * safe to repeat. It seeds the account when missing and otherwise only
     * repairs what would lock the owner out — role, status and email
     * verification. Name, username, email and password are the account holder's
     * to change from the settings screen, so they are left alone unless --reset
     * is passed explicitly for credential recovery.
     */
    public function handle(): int
    {
        $email = (string) $this->option('email');
        $username = (string) $this->option('username');
        $password = (string) $this->option('password');
        $name = (string) $this->option('name');
        $reset = (bool) $this->option('reset');

        $user = User::withTrashed()
            ->where(function ($query) use ($email, $username) {
                $query->where('email', $email)->orWhere('username', $username);
            })
            ->first();

        if (! $user) {
            $user = new User([
                'name' => $name,
                'email' => $email,
                'username' => $username,
                'password' => $password,
                'role' => UserRole::HeadDoctor,
                'status' => 'active',
            ]);
            $user->email_verified_at = now();
            $user->save();

            $this->info("Created Head Doctor #{$user->id} ({$email}).");
            $this->line('Temporary password: '.$password);

            return self::SUCCESS;
        }

        if ($user->trashed()) {
            $user->restore();
            $this->warn("Restored soft-deleted Head Doctor #{$user->id}.");
        }

        if ($reset) {
            $emailChanged = strcasecmp((string) $user->email, $email) !== 0;
            $user->fill([
                'name' => $name,
                'email' => $email,
                'username' => $username,
                'password' => $password,
            ]);
            if ($emailChanged) {
                $user->google_id = null;
            }
        }

        // Access repairs, applied every run: without these the only Head Doctor
        // could be left unable to sign in with no other account able to fix it.
        $user->role = UserRole::HeadDoctor;
        $user->status = 'active';
        $user->email_verified_at ??= now();

        $changes = array_keys($user->getDirty());
        $user->save();

        if ($reset) {
            $this->warn("Reset Head Doctor #{$user->id} credentials ({$user->email}).");
            $this->line('Temporary password: '.$password);
        } elseif ($changes) {
            $this->info("Repaired Head Doctor #{$user->id}: ".implode(', ', $changes).'.');
        } else {
            $this->info("Head Doctor #{$user->id} already in good standing; left unchanged.");
        }

        return self::SUCCESS;
    }
}
