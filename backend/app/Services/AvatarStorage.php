<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

class AvatarStorage
{
    public function __construct(private MediaStorage $media)
    {
    }

    public function diskName(): string
    {
        return $this->media->diskName();
    }

    public function store(UploadedFile $file, int $userId, ?string $previousPath = null): string
    {
        return $this->media->store($file, 'avatars/'.$userId, $previousPath);
    }

    public function delete(?string $path): void
    {
        $this->media->delete($path);
    }

    public function url(?string $path): ?string
    {
        return $this->media->url($path);
    }
}
