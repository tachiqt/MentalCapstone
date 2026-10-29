<?php

namespace App\Models;

use App\Services\MediaStorage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningMaterial extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title',
        'description',
        'type',
        'file_path',
        'tags',
        'uploaded_by',
        'child_id',
    ];

    protected $appends = [
        'file_url',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
        ];
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function assignedChildren(): BelongsToMany
    {
        return $this->belongsToMany(Child::class, 'child_learning_material')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function getFileUrlAttribute(): ?string
    {
        return app(MediaStorage::class)->url($this->file_path);
    }
}
