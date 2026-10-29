<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Assessment extends Model
{
    protected $fillable = [
        'child_id',
        'assessment_checklist_id',
        'psychometrician_id',
        'severity_level',
        'conditions_json',
        'notes',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'conditions_json' => 'array',
        ];
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function checklist(): BelongsTo
    {
        return $this->belongsTo(AssessmentChecklist::class, 'assessment_checklist_id');
    }

    public function psychometrician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'psychometrician_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(AssessmentResponse::class);
    }

    public function aiRecommendations(): HasMany
    {
        return $this->hasMany(AiRecommendation::class);
    }

    public function resolveAiGenerationStatus(): string
    {
        $activeStatuses = ['pending_review', 'approved', 'modified'];

        if ($this->relationLoaded('aiRecommendations')) {
            $latest = $this->aiRecommendations->first();
        } else {
            $latest = $this->aiRecommendations()
                ->where('status', '!=', 'rejected')
                ->latest()
                ->first();
        }

        if (! $latest) {
            return 'none';
        }

        return in_array($latest->status, $activeStatuses, true) ? $latest->status : 'none';
    }
}
