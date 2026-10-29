<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TherapySession extends Model
{
    protected $fillable = [
        'therapy_plan_id',
        'child_id',
        'teacher_id',
        'scheduled_at',
        'duration_minutes',
        'status',
        'observations',
        'outcomes',
        'intervention_notes',
        'participation',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
        ];
    }

    public function therapyPlan(): BelongsTo
    {
        return $this->belongsTo(TherapyPlan::class);
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }
}
