<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgressPhoto extends Model
{
    protected $fillable = [
        'progress_record_id',
        'uploaded_by',
        'original_filename',
        'mime_type',
        'size_bytes',
        'disk',
        'file_path',
        'sort_order',
    ];

    protected $appends = [
        'download_path',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function progressRecord(): BelongsTo
    {
        return $this->belongsTo(ProgressRecord::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function getDownloadPathAttribute(): string
    {
        return '/progress-photos/'.$this->id.'/file';
    }
}
