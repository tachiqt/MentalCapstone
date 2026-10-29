<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkspaceSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
    ];

    /**
     * @return array<string, string>
     */
    public static function defaults(): array
    {
        return [
            'facility_name' => 'Malvar Assisted Facility',
            'timezone' => 'Asia/Manila',
            'default_session_minutes' => '60',
            'reminder_lead_minutes' => '0',
        ];
    }

    public static function getValue(string $key, ?string $default = null): string
    {
        $row = static::query()->where('key', $key)->first();
        if ($row && $row->value !== null && $row->value !== '') {
            return (string) $row->value;
        }

        return $default ?? (static::defaults()[$key] ?? '');
    }

    public static function putValue(string $key, string $value): void
    {
        static::query()->updateOrCreate(
            ['key' => $key],
            ['value' => $value]
        );
    }

    /**
     * @return array<string, string>
     */
    public static function keyed(): array
    {
        $stored = static::query()->pluck('value', 'key')->map(fn ($value) => (string) $value)->all();

        return array_merge(static::defaults(), $stored);
    }
}
