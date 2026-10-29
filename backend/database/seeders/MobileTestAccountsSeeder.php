<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Mobile app test logins — safe to re-run (updateOrCreate).
 * Password for all: password
 */
class MobileTestAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $password = 'password';

        $accounts = [
            [
                'username' => 'mobile_teacher',
                'name' => 'Mobile Teacher',
                'email' => 'mobile.teacher@smartcare.local',
                'role' => UserRole::Teacher,
            ],
            [
                'username' => 'mobile_caretaker',
                'name' => 'Mobile Caretaker',
                'email' => 'mobile.caretaker@smartcare.local',
                'role' => UserRole::Caretaker,
            ],
            [
                'username' => 'mobile_parent',
                'name' => 'Mobile Parent',
                'email' => 'mobile.parent@smartcare.local',
                'role' => UserRole::Parent,
            ],
        ];

        foreach ($accounts as $data) {
            User::updateOrCreate(
                ['username' => $data['username']],
                [
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'password' => $password,
                    'role' => $data['role'],
                    'status' => 'active',
                    'email_verified_at' => now(),
                ]
            );
        }
    }
}
