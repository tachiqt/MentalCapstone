<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->unique()->after('name');
            $table->string('role', 32)->default('parent')->after('password');
            $table->string('status', 20)->default('active')->after('role');
            $table->softDeletes();
        });

        Schema::create('children', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');
            $table->date('birth_date')->nullable();
            $table->string('sex', 20)->nullable();
            $table->string('condition_notes')->nullable();
            $table->string('diagnosis')->nullable();
            $table->unsignedTinyInteger('age_band')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('child_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('relation', 32);
            $table->timestamps();
            $table->unique(['child_id', 'user_id', 'relation']);
        });

        Schema::create('assessment_checklists', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('checklist_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('assessment_checklist_id')->constrained()->cascadeOnDelete();
            $table->string('prompt');
            $table->string('domain')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('assessments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('assessment_checklist_id')->constrained()->cascadeOnDelete();
            $table->foreignId('psychometrician_id')->constrained('users')->cascadeOnDelete();
            $table->string('severity_level', 32)->nullable();
            $table->json('conditions_json')->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 32)->default('finalized');
            $table->timestamps();
        });

        Schema::create('assessment_responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('assessment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('checklist_item_id')->constrained()->cascadeOnDelete();
            $table->string('score')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();
        });

        Schema::create('progress_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->text('summary')->nullable();
            $table->string('milestone')->nullable();
            $table->date('recorded_on')->nullable();
            $table->timestamps();
        });

        Schema::create('learning_materials', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('type')->nullable();
            $table->string('file_path')->nullable();
            $table->json('tags')->nullable();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ai_recommendations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('assessment_id')->nullable()->constrained()->nullOnDelete();
            $table->json('prompt_payload')->nullable();
            $table->json('openai_response_json')->nullable();
            $table->string('status', 32)->default('pending_review');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('teacher_notes')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('therapy_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('ai_recommendation_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedTinyInteger('sessions_per_week')->default(2);
            $table->string('status', 32)->default('active');
            $table->timestamps();
        });

        Schema::create('therapy_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapy_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->dateTime('scheduled_at');
            $table->unsignedSmallInteger('duration_minutes')->default(60);
            $table->string('status', 32)->default('scheduled');
            $table->text('observations')->nullable();
            $table->text('outcomes')->nullable();
            $table->text('intervention_notes')->nullable();
            $table->string('participation')->nullable();
            $table->timestamps();
        });

        Schema::create('medication_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('medicine_name');
            $table->string('dosage')->nullable();
            $table->string('instructions')->nullable();
            $table->time('time_of_day')->nullable();
            $table->json('days_of_week')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('medication_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medication_schedule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->foreignId('caretaker_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 20);
            $table->timestamp('administered_at');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('parent_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('child_id')->constrained('children')->cascadeOnDelete();
            $table->string('subject');
            $table->string('category')->nullable();
            $table->text('message');
            $table->string('status', 32)->default('open');
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('body')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action');
            $table->string('subject_type')->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('parent_feedback');
        Schema::dropIfExists('medication_logs');
        Schema::dropIfExists('medication_schedules');
        Schema::dropIfExists('therapy_sessions');
        Schema::dropIfExists('therapy_plans');
        Schema::dropIfExists('ai_recommendations');
        Schema::dropIfExists('learning_materials');
        Schema::dropIfExists('progress_records');
        Schema::dropIfExists('assessment_responses');
        Schema::dropIfExists('assessments');
        Schema::dropIfExists('checklist_items');
        Schema::dropIfExists('assessment_checklists');
        Schema::dropIfExists('child_user');
        Schema::dropIfExists('children');
        Schema::table('users', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn(['username', 'role', 'status']);
        });
    }
};
