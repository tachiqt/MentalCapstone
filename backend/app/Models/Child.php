<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Child extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'first_name',
        'last_name',
        'birth_date',
        'sex',
        'condition_notes',
        'diagnosis',
        'age_band',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'child_user')
            ->withPivot('relation')
            ->withTimestamps();
    }

    public function assessments(): HasMany
    {
        return $this->hasMany(Assessment::class);
    }

    public function aiRecommendations(): HasMany
    {
        return $this->hasMany(AiRecommendation::class);
    }

    public function therapyPlans(): HasMany
    {
        return $this->hasMany(TherapyPlan::class);
    }

    public function therapySessions(): HasMany
    {
        return $this->hasMany(TherapySession::class);
    }

    public function medicationSchedules(): HasMany
    {
        return $this->hasMany(MedicationSchedule::class);
    }

    public function medicationLogs(): HasMany
    {
        return $this->hasMany(MedicationLog::class);
    }

    public function progressRecords(): HasMany
    {
        return $this->hasMany(ProgressRecord::class);
    }

    public function parentFeedback(): HasMany
    {
        return $this->hasMany(ParentFeedback::class);
    }

    public function diagnosisHistories(): HasMany
    {
        return $this->hasMany(DiagnosisHistory::class)->orderByDesc('created_at');
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(ChildStatusHistory::class)->orderByDesc('created_at');
    }

    public function learningMaterials(): BelongsToMany
    {
        return $this->belongsToMany(LearningMaterial::class, 'child_learning_material')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function hiddenLearningMaterials(): BelongsToMany
    {
        return $this->belongsToMany(LearningMaterial::class, 'child_learning_material_hidden')
            ->withTimestamps();
    }

    /** Facility registry status: active | inactive | deleted */
    public function facilityStatus(): string
    {
        if ($this->trashed()) {
            return 'deleted';
        }

        return $this->is_active ? 'active' : 'inactive';
    }
}
