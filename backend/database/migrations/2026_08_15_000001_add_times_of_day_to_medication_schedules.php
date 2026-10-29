<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medication_schedules', function (Blueprint $table) {
            $table->json('times_of_day')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('medication_schedules', function (Blueprint $table) {
            $table->dropColumn('times_of_day');
        });
    }
};
