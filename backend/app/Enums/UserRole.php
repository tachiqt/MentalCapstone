<?php

namespace App\Enums;

enum UserRole: string
{
    case HeadDoctor = 'head_doctor';
    case Psychometrician = 'psychometrician';
    case Teacher = 'teacher';
    case Caretaker = 'caretaker';
    case Parent = 'parent';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function webRoles(): array
    {
        return [self::HeadDoctor, self::Psychometrician];
    }

    public function isWebRole(): bool
    {
        return in_array($this, self::webRoles(), true);
    }
}
