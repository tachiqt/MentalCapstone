<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TherapyPlan extends Model
{
    protected $fillable = [
        'child_id',
        'teacher_id',
        'ai_recommendation_id',
        'title',
        'description',
        'sessions_per_week',
        'status',
    ];

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function aiRecommendation(): BelongsTo
    {
        return $this->belongsTo(AiRecommendation::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(TherapySession::class);
    }
}
