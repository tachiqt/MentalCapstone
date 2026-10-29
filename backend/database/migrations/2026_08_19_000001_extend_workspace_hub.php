<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 40)->nullable()->after('email');
            $table->json('preferences')->nullable()->after('status');
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->string('topic', 191)->nullable()->after('type');
            $table->json('data')->nullable()->after('body');
            $table->unique(['user_id', 'topic']);
        });

        Schema::create('workspace_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_settings');

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'topic']);
            $table->dropColumn(['topic', 'data']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['phone', 'preferences']);
        });
    }
};
