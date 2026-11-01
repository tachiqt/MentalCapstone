<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

    public function privateDiskName(): string
    {
        $configured = (string) config('filesystems.private_media_disk', 'local');
        $disks = config('filesystems.disks', []);

        if (in_array($configured, ['gcs', 'gcs_private'], true)) {
            $bucket = (string) ($disks[$configured]['bucket'] ?? '');
            if ($bucket === '') {
                return 'local';
            }
        }

        return array_key_exists($configured, $disks) ? $configured : 'local';
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

    /**
     * Store a sensitive file on the private media disk (no public URL).
     *
     * @return array{path: string, disk: string}
     */
    public function storePrivate(UploadedFile $file, string $directory, ?string $previousPath = null, ?string $previousDisk = null): array
    {
        $disk = $this->privateDiskName();
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');
        $directory = trim($directory, '/');
        $path = sprintf('%s/%s.%s', $directory, Str::uuid()->toString(), $extension);

        Storage::disk($disk)->putFileAs(
            dirname($path),
            $file,
            basename($path),
            ['visibility' => 'private']
        );

        if ($previousPath) {
            $this->deletePrivate($previousPath, $previousDisk);
        }

        return ['path' => $path, 'disk' => $disk];
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

    public function deletePrivate(?string $path, ?string $disk = null): void
    {
        if (! $path) {
            return;
        }

        $diskName = $disk ?: $this->privateDiskName();
        if (Storage::disk($diskName)->exists($path)) {
            Storage::disk($diskName)->delete($path);
        }
    }

    public function streamPrivate(?string $path, string $downloadName, ?string $disk = null, ?string $mimeType = null): StreamedResponse
    {
        abort_unless($path, 404);

        $diskName = $disk ?: $this->privateDiskName();
        abort_unless(Storage::disk($diskName)->exists($path), 404);

        return Storage::disk($diskName)->response(
            $path,
            $downloadName,
            array_filter([
                'Content-Type' => $mimeType,
            ])
        );
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
