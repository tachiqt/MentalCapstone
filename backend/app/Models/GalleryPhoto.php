<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GalleryPhoto extends Model
{
    protected $fillable = [
        'gallery_album_id',
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

    public function album(): BelongsTo
    {
        return $this->belongsTo(GalleryAlbum::class, 'gallery_album_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function getDownloadPathAttribute(): string
    {
        return '/gallery-photos/'.$this->id.'/file';
    }
}
