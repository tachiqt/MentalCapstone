<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'avatar_path',
        'username',
        'password',
        'role',
        'status',
        'preferences',
        'google_id',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'avatar_path',
    ];

    protected $appends = [
        'avatar_url',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'preferences' => 'array',
        ];
    }

    public function getAvatarUrlAttribute(): ?string
    {
        return app(\App\Services\AvatarStorage::class)->url($this->avatar_path);
    }

    public function children(): BelongsToMany
    {
        return $this->belongsToMany(Child::class, 'child_user')
            ->withPivot('relation')
            ->withTimestamps();
    }

    public function therapyPlans(): HasMany
    {
        return $this->hasMany(TherapyPlan::class, 'teacher_id');
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification);
    }

    public function emailVerificationUrl(): string
    {
        return VerifyEmailNotification::signedUrl($this);
    }

    public function trySendEmailVerificationNotification(): bool
    {
        $attempts = 0;
        $maxAttempts = 3;
        $lastError = null;

        while ($attempts < $maxAttempts) {
            $attempts++;
            try {
                $this->sendEmailVerificationNotification();

                return true;
            } catch (\Throwable $e) {
                $lastError = $e;
                \Log::warning('Failed to send SmartCare verification email.', [
                    'user_id' => $this->id,
                    'email' => $this->email,
                    'attempt' => $attempts,
                    'mailer' => config('mail.default'),
                    'from' => config('mail.from.address'),
                    'resend_configured' => filled(config('services.resend.key')),
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                ]);
                if ($attempts < $maxAttempts) {
                    usleep(500_000);
                }
            }
        }

        if ($lastError) {
            report($lastError);
        }

        return false;
    }
}
