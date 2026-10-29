<?php

namespace App\Providers;

use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
use App\Models\Child;
use App\Models\LearningMaterial;
use App\Models\MedicationLog;
use App\Models\MedicationSchedule;
use App\Models\ParentFeedback;
use App\Models\ProgressRecord;
use App\Models\TherapyPlan;
use App\Models\TherapySession;
use App\Models\User;
use App\Observers\WorkspaceActivityObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $observer = WorkspaceActivityObserver::class;
        Child::observe($observer);
        TherapySession::observe($observer);
        MedicationSchedule::observe($observer);
        MedicationLog::observe($observer);
        AssessmentChecklist::observe($observer);
        Assessment::observe($observer);
        LearningMaterial::observe($observer);
        AiRecommendation::observe($observer);
        ParentFeedback::observe($observer);
        ProgressRecord::observe($observer);
        TherapyPlan::observe($observer);
        User::observe($observer);
    }
}
