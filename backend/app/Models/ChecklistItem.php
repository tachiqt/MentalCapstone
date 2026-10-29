<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChecklistItem extends Model
{
    protected $fillable = [
        'assessment_checklist_id',
        'prompt',
        'domain',
        'sort_order',
    ];

    public function checklist(): BelongsTo
    {
        return $this->belongsTo(AssessmentChecklist::class, 'assessment_checklist_id');
    }
}
