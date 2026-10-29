<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AiRecommendation extends Model
{
    protected $fillable = [
        'child_id',
        'assessment_id',
        'prompt_payload',
        'openai_response_json',
        'status',
        'reviewed_by',
        'teacher_notes',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'prompt_payload' => 'array',
            'openai_response_json' => 'array',
            'reviewed_at' => 'datetime',
        ];
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function assessment(): BelongsTo
    {
        return $this->belongsTo(Assessment::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function therapyPlan(): HasOne
    {
        return $this->hasOne(TherapyPlan::class);
    }
}
