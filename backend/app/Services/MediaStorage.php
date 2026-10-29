<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaStorage
{
    public function diskName(): string
    {
        $configured = (string) config('filesystems.media_disk', config('filesystems.avatars_disk', 'public'));
        $disks = config('filesystems.disks', []);

        if ($configured === 'gcs' && empty($disks['gcs']['bucket'])) {
            return 'public';
        }

        return array_key_exists($configured, $disks) ? $configured : 'public';
    }

    public function store(UploadedFile $file, string $directory, ?string $previousPath = null): string
    {
        $disk = $this->diskName();
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');
        $directory = trim($directory, '/');
        $path = sprintf('%s/%s.%s', $directory, Str::uuid()->toString(), $extension);

        Storage::disk($disk)->putFileAs(
            dirname($path),
            $file,
            basename($path),
            ['visibility' => 'public']
        );

        if ($previousPath) {
            $this->delete($previousPath);
        }

        return $path;
    }

    public function delete(?string $path): void
    {
        if (! $path) {
            return;
        }

        $disk = $this->diskName();
        if (Storage::disk($disk)->exists($path)) {
            Storage::disk($disk)->delete($path);
        }
    }

    public function url(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return Storage::disk($this->diskName())->url($path);
    }

    public function publicAssetUrl(string $relativePath): string
    {
        $relativePath = ltrim(str_replace('\\', '/', $relativePath), '/');
        $base = rtrim((string) config('filesystems.assets_url', ''), '/');

        if ($base !== '') {
            return $base.'/'.$relativePath;
        }

        return asset($relativePath);
    }
}
