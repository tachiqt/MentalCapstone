<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

class SyncWebAssetsCommand extends Command
{
    protected $signature = 'smartcare:sync-web-assets {--dry-run : List files without uploading}';

    protected $description = 'Upload backend/public/web/assets to the configured media disk (GCS in production)';

    public function handle(): int
    {
        $localRoot = public_path('web/assets');
        if (! is_dir($localRoot)) {
            $this->warn('No local assets directory at public/web/assets');

            return self::SUCCESS;
        }

        $diskName = app(\App\Services\MediaStorage::class)->diskName();
        $disk = Storage::disk($diskName);
        $prefix = 'assets/web';
        $count = 0;

        foreach (File::allFiles($localRoot) as $file) {
            if (strtolower($file->getFilename()) === 'readme.md') {
                continue;
            }
            $relative = str_replace('\\', '/', $file->getRelativePathname());
            $dest = $prefix.'/'.$relative;
            $this->line(($this->option('dry-run') ? '[dry-run] ' : '')."{$relative} -> {$diskName}:{$dest}");
            if (! $this->option('dry-run')) {
                $disk->put($dest, file_get_contents($file->getPathname()), ['visibility' => 'public']);
            }
            $count++;
        }

        $this->info("Synced {$count} asset file(s) to disk [{$diskName}] under {$prefix}/");

        $bucket = config('filesystems.disks.gcs.bucket');
        $pathPrefix = trim((string) config('filesystems.disks.gcs.path_prefix'), '/');
        if ($bucket) {
            $base = 'https://storage.googleapis.com/'.$bucket;
            if ($pathPrefix !== '') {
                $base .= '/'.$pathPrefix;
            }
            $this->line('Set ASSETS_URL='.$base.'/'.$prefix);
        }

        return self::SUCCESS;
    }
}
