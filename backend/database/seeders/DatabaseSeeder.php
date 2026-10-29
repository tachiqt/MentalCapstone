<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            SampleDataSeeder::class,
            MobileTestAccountsSeeder::class,
            MobileDemoDataSeeder::class,
        ]);
    }
}
