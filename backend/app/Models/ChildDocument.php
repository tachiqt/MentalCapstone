<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChildDocument extends Model
{
    public const CATEGORIES = [
        'birth_certificate',
        'pwd_id',
        'other',
    ];

    protected $fillable = [
        'child_id',
        'uploaded_by',
        'category',
        'title',
        'original_filename',
        'mime_type',
        'size_bytes',
        'disk',
        'file_path',
    ];

    protected $appends = [
        'download_path',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
        ];
    }

    public function child(): BelongsTo
    {
        return $this->belongsTo(Child::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function getDownloadPathAttribute(): string
    {
        return '/children/'.$this->child_id.'/documents/'.$this->id.'/file';
    }
}
