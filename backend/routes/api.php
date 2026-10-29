<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AssessmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChecklistController;
use App\Http\Controllers\Api\ChildController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\LandingStatsController;
use App\Http\Controllers\Api\LearningMaterialController;
use App\Http\Controllers\Api\MedicationLogController;
use App\Http\Controllers\Api\MedicationScheduleController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ParentFeedbackController;
use App\Http\Controllers\Api\ProgressController;
use App\Http\Controllers\Api\RecommendationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\TherapyPlanController;
use App\Http\Controllers\Api\TherapySessionController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkspaceSettingController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('app-config', function () {
        return response()->json([
            'assets_url' => (string) config('filesystems.assets_url', ''),
            'app_name' => config('app.name', 'SmartCare'),
            'google_client_id' => (string) config('services.google.client_id', ''),
        ]);
    });
    Route::get('landing-stats', LandingStatsController::class)->middleware('throttle:60,1');

    Route::post('login', [AuthController::class, 'login']);
    Route::post('auth/google', [AuthController::class, 'googleLogin']);
    Route::get('email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware('signed')
        ->name('verification.verify');
    Route::post('auth/resend-verification', [EmailVerificationController::class, 'resendByEmail'])
        ->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);
        Route::post('email/resend', [EmailVerificationController::class, 'resend']);
        Route::get('me', [AuthController::class, 'me']);
        Route::put('me', [AuthController::class, 'updateMe']);
        Route::post('me/avatar', [AuthController::class, 'uploadAvatar']);
        Route::delete('me/avatar', [AuthController::class, 'deleteAvatar']);
        Route::put('me/password', [AuthController::class, 'updatePassword']);
        Route::put('me/preferences', [AuthController::class, 'updatePreferences']);
        Route::post('me/logout-others', [AuthController::class, 'logoutOthers']);

        Route::get('search', SearchController::class);
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::patch('notifications/{notification}/read', [NotificationController::class, 'markRead']);

        Route::get('workspace', [WorkspaceSettingController::class, 'show']);
        Route::put('workspace', [WorkspaceSettingController::class, 'update'])->middleware('role:head_doctor');

        Route::middleware('role:head_doctor')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::post('users', [UserController::class, 'store']);
            Route::get('users/{user}', [UserController::class, 'show']);
            Route::put('users/{user}', [UserController::class, 'update']);
            Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);
            Route::post('users/{user}/resend-verification', [UserController::class, 'resendVerification']);
            Route::patch('users/{user}/deactivate', [UserController::class, 'deactivate']);
            Route::delete('users/{user}', [UserController::class, 'destroy']);
            Route::get('activity-logs', [ActivityLogController::class, 'index']);

            Route::get('reports/facility', [ReportController::class, 'facility']);
            Route::get('reports/medication', [ReportController::class, 'medicationReport']);
        });

        Route::middleware('role:head_doctor,psychometrician')->group(function () {
            Route::get('reports/overview', [ReportController::class, 'facility']);
            Route::get('reports/psychometrician-summary', [ReportController::class, 'psychometricianSummary']);
        });

        Route::middleware('role:head_doctor,psychometrician')->group(function () {
            Route::get('checklists', [ChecklistController::class, 'index']);
            Route::get('checklists/{assessmentChecklist}', [ChecklistController::class, 'show']);
            Route::post('checklists', [ChecklistController::class, 'store']);
            Route::post('checklists/suggest', [ChecklistController::class, 'suggest']);
            Route::put('checklists/{assessmentChecklist}', [ChecklistController::class, 'update']);
            Route::delete('checklists/{assessmentChecklist}', [ChecklistController::class, 'destroy']);
        });

        Route::get('children', [ChildController::class, 'index']);
        Route::get('children/{child}', [ChildController::class, 'show']);

        Route::middleware('role:head_doctor,psychometrician')->group(function () {
            Route::post('children', [ChildController::class, 'store']);
            Route::put('children/{child}', [ChildController::class, 'update']);
            Route::patch('children/{child}/diagnosis', [ChildController::class, 'updateDiagnosis']);
            Route::get('children/{child}/diagnosis-history', [ChildController::class, 'diagnosisHistory']);
            Route::get('children/{child}/status-history', [ChildController::class, 'statusHistory']);
            Route::patch('children/{child}/deactivate', [ChildController::class, 'deactivate']);
            Route::patch('children/{child}/activate', [ChildController::class, 'activate']);
            Route::post('children/{child}/assign', [ChildController::class, 'assign']);
            Route::post('assignments', [ChildController::class, 'assignBatch']);
        });

        Route::middleware('role:head_doctor')->group(function () {
            Route::delete('children/{child}', [ChildController::class, 'destroy']);
            Route::post('children/{id}/restore', [ChildController::class, 'restore'])->whereNumber('id');
        });

        Route::middleware('role:psychometrician,head_doctor,teacher')->group(function () {
            Route::get('assessments', [AssessmentController::class, 'all']);
            Route::get('children/{child}/assessments', [AssessmentController::class, 'index']);
            Route::get('assessments/{assessment}', [AssessmentController::class, 'show']);
            Route::post('children/{child}/recommendations/generate', [RecommendationController::class, 'generate']);
        });

        Route::middleware('role:psychometrician,head_doctor')->group(function () {
            Route::post('children/{child}/assessments', [AssessmentController::class, 'store']);
        });

        Route::get('children/{child}/recommendations', [RecommendationController::class, 'index']);
        Route::get('recommendations', [RecommendationController::class, 'feed']);

        Route::middleware('role:teacher,head_doctor')->group(function () {
            Route::post('recommendations/{aiRecommendation}/review', [RecommendationController::class, 'review']);
        });

        Route::get('learning-materials', [LearningMaterialController::class, 'index']);
        Route::get('learning-materials/{learningMaterial}', [LearningMaterialController::class, 'show']);

        Route::middleware('role:head_doctor,teacher')->group(function () {
            Route::post('learning-materials', [LearningMaterialController::class, 'store']);
            Route::post('learning-materials/{learningMaterial}', [LearningMaterialController::class, 'update']);
            Route::put('learning-materials/{learningMaterial}', [LearningMaterialController::class, 'update']);
            Route::put('children/{child}/learning-materials', [LearningMaterialController::class, 'syncForChild']);
        });

        Route::middleware('role:head_doctor')->group(function () {
            Route::delete('learning-materials/{learningMaterial}', [LearningMaterialController::class, 'destroy']);
        });

        Route::get('therapy-sessions', [TherapySessionController::class, 'index']);
        Route::get('therapy-plans', [TherapyPlanController::class, 'index'])->middleware('role:teacher,head_doctor');

        Route::middleware('role:teacher,head_doctor')->group(function () {
            Route::post('therapy-plans', [TherapyPlanController::class, 'store']);
            Route::put('therapy-plans/{therapyPlan}', [TherapyPlanController::class, 'update']);
        });

        Route::middleware('role:teacher')->group(function () {
            Route::post('therapy-sessions/suggest', [TherapySessionController::class, 'suggest']);
            Route::post('therapy-sessions', [TherapySessionController::class, 'store']);
            Route::put('therapy-sessions/{therapySession}', [TherapySessionController::class, 'update']);
            Route::delete('therapy-sessions/{therapySession}', [TherapySessionController::class, 'destroy']);
        });

        Route::get('medication-schedules', [MedicationScheduleController::class, 'index']);

        Route::middleware('role:teacher,head_doctor')->group(function () {
            Route::post('medication-schedules', [MedicationScheduleController::class, 'store']);
            Route::put('medication-schedules/{medicationSchedule}', [MedicationScheduleController::class, 'update']);
        });

        Route::get('children/{child}/medication-logs', [MedicationLogController::class, 'index']);
        Route::get('medication-logs', [MedicationLogController::class, 'all']);

        Route::middleware('role:caretaker')->group(function () {
            Route::post('medication-logs', [MedicationLogController::class, 'store']);
        });

        Route::get('children/{child}/progress', [ProgressController::class, 'index']);
        Route::get('progress', [ProgressController::class, 'all']);

        Route::middleware('role:teacher,head_doctor,caretaker')->group(function () {
            Route::post('children/{child}/progress', [ProgressController::class, 'store']);
        });

        Route::get('children/{child}/parent-feedback', [ParentFeedbackController::class, 'index']);
        Route::get('parent-feedback', [ParentFeedbackController::class, 'mine']);

        Route::middleware('role:parent')->group(function () {
            Route::post('parent-feedback', [ParentFeedbackController::class, 'store']);
        });

        Route::middleware('role:teacher,head_doctor,psychometrician,caretaker')->group(function () {
            Route::patch('parent-feedback/{parentFeedback}', [ParentFeedbackController::class, 'update']);
        });

        Route::get('reports/children/{child}', [ReportController::class, 'childReport']);
    });
});
