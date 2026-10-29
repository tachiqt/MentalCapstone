<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class QueryCache
{
    public const WORKSPACE = 'workspace.settings';

    public const CHECKLISTS = 'checklists.active';

    public const CHILDREN = 'children.directory';

    public const USERS = 'users.directory';

    public const MATERIALS = 'materials.catalog';

    public static function meKey(int|string $userId): string
    {
        return 'me.'.$userId;
    }

    public static function childrenKey(int|string $userId): string
    {
        return self::CHILDREN.'.'.$userId;
    }

    public static function remember(string $key, int $ttlSeconds, callable $callback): mixed
    {
        return Cache::remember($key, $ttlSeconds, $callback);
    }

    public static function forget(string ...$keys): void
    {
        foreach ($keys as $key) {
            Cache::forget($key);
        }
    }
}
