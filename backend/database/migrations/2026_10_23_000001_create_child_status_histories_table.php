<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('child_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->string('previous_status', 16);
            $table->string('new_status', 16);
            $table->string('action', 32);
            $table->foreignId('changed_by')->constrained('users')->cascadeOnDelete();
            $table->string('note', 1000)->nullable();
            $table->timestamps();

            $table->index(['child_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('child_status_histories');
    }
};
