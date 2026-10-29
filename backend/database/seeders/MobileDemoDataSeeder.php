<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
use App\Models\AssessmentResponse;
use App\Models\ChecklistItem;
use App\Models\Child;
use App\Models\LearningMaterial;
use App\Models\MedicationLog;
use App\Models\MedicationSchedule;
use App\Models\Notification;
use App\Models\ParentFeedback;
use App\Models\ProgressRecord;
use App\Models\TherapyPlan;
use App\Models\TherapySession;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Demo data for mobile test accounts: mobile_teacher, mobile_caretaker, mobile_parent.
 * Safe to re-run — uses updateOrCreate on stable keys.
 */
class MobileDemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $teacher = User::where('username', 'mobile_teacher')->first();
        $caretaker = User::where('username', 'mobile_caretaker')->first();
        $parent = User::where('username', 'mobile_parent')->first();
        $psychometrician = User::where('role', UserRole::Psychometrician)->first();

        if (! $teacher || ! $caretaker || ! $parent) {
            $this->command?->warn('Run MobileTestAccountsSeeder first.');

            return;
        }

        $checklist = AssessmentChecklist::firstOrCreate(
            ['title' => 'Mobile Demo Checklist'],
            [
                'description' => 'Quick checklist for mobile demo recommendations.',
                'created_by' => User::where('role', UserRole::HeadDoctor)->value('id') ?? $teacher->id,
                'is_active' => true,
            ]
        );

        $item = ChecklistItem::firstOrCreate(
            ['assessment_checklist_id' => $checklist->id, 'prompt' => 'Engages with structured activities'],
            ['domain' => 'cognitive', 'sort_order' => 1]
        );

        $lucas = $this->upsertChild('Lucas', 'Mendoza', [
            'birth_date' => '2018-04-12',
            'sex' => 'male',
            'diagnosis' => 'Autism spectrum — moderate support',
            'condition_notes' => 'Responds well to visual schedules.',
            'age_band' => 7,
        ], [
            $teacher->id => 'teacher',
            $caretaker->id => 'caretaker',
            $parent->id => 'parent',
        ]);

        $emma = $this->upsertChild('Emma', 'Torres', [
            'birth_date' => '2019-09-03',
            'sex' => 'female',
            'diagnosis' => 'Speech and language delay',
            'condition_notes' => 'Uses picture cards at home.',
            'age_band' => 6,
        ], [
            $teacher->id => 'teacher',
            $caretaker->id => 'caretaker',
            $parent->id => 'parent',
        ]);

        $plan = TherapyPlan::updateOrCreate(
            ['child_id' => $lucas->id, 'title' => 'Communication & motor skills'],
            [
                'teacher_id' => $teacher->id,
                'description' => 'Structured sessions with visual supports and sensory play.',
                'sessions_per_week' => 3,
                'status' => 'active',
            ]
        );

        TherapySession::updateOrCreate(
            ['child_id' => $lucas->id, 'scheduled_at' => now()->subDays(3)->setTime(10, 0)],
            [
                'therapy_plan_id' => $plan->id,
                'teacher_id' => $teacher->id,
                'duration_minutes' => 45,
                'status' => 'completed',
                'participation' => 'engaged',
                'observations' => 'Stayed on task for 25 minutes with one prompt.',
                'outcomes' => 'Completed matching activity independently.',
            ]
        );

        TherapySession::updateOrCreate(
            ['child_id' => $lucas->id, 'scheduled_at' => now()->addDays(2)->setTime(14, 0)],
            [
                'therapy_plan_id' => $plan->id,
                'teacher_id' => $teacher->id,
                'duration_minutes' => 45,
                'status' => 'scheduled',
            ]
        );

        TherapySession::updateOrCreate(
            ['child_id' => $emma->id, 'scheduled_at' => now()->addDays(1)->setTime(9, 30)],
            [
                'teacher_id' => $teacher->id,
                'duration_minutes' => 40,
                'status' => 'scheduled',
            ]
        );

        $melatonin = MedicationSchedule::updateOrCreate(
            ['child_id' => $lucas->id, 'medicine_name' => 'Melatonin'],
            [
                'created_by' => $teacher->id,
                'dosage' => '3mg',
                'instructions' => 'Give 30 minutes before bedtime.',
                'time_of_day' => '20:00:00',
                'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
                'is_active' => true,
            ]
        );

        $vitaminD = MedicationSchedule::updateOrCreate(
            ['child_id' => $emma->id, 'medicine_name' => 'Vitamin D'],
            [
                'created_by' => $teacher->id,
                'dosage' => '400 IU',
                'instructions' => 'With breakfast.',
                'time_of_day' => '08:00:00',
                'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
                'is_active' => true,
            ]
        );

        MedicationLog::updateOrCreate(
            [
                'medication_schedule_id' => $melatonin->id,
                'child_id' => $lucas->id,
                'administered_at' => now()->subDay()->setTime(20, 5),
            ],
            [
                'caretaker_id' => $caretaker->id,
                'status' => 'given',
                'notes' => 'Taken without issue.',
            ]
        );

        MedicationLog::updateOrCreate(
            [
                'medication_schedule_id' => $vitaminD->id,
                'child_id' => $emma->id,
                'administered_at' => now()->subDays(2)->setTime(8, 10),
            ],
            [
                'caretaker_id' => $caretaker->id,
                'status' => 'given',
                'notes' => 'Taken with breakfast.',
            ]
        );

        ProgressRecord::updateOrCreate(
            ['child_id' => $lucas->id, 'title' => 'Picture matching milestone'],
            [
                'recorded_by' => $teacher->id,
                'summary' => 'Matched 8 of 10 picture cards without verbal prompts.',
                'milestone' => 'Independent matching',
                'recorded_on' => now()->subDays(4)->toDateString(),
            ]
        );

        ProgressRecord::updateOrCreate(
            ['child_id' => $emma->id, 'title' => 'Two-word requests'],
            [
                'recorded_by' => $teacher->id,
                'summary' => 'Used two-word requests three times during session.',
                'milestone' => 'Expressive language',
                'recorded_on' => now()->subDays(5)->toDateString(),
            ]
        );

        ParentFeedback::updateOrCreate(
            ['parent_id' => $parent->id, 'child_id' => $lucas->id, 'subject' => 'Home routine update'],
            [
                'category' => 'communication',
                'message' => 'We practiced the visual schedule twice daily this week. Bedtime is smoother.',
                'status' => 'open',
            ]
        );

        ParentFeedback::updateOrCreate(
            ['parent_id' => $parent->id, 'child_id' => $emma->id, 'subject' => 'Speech practice at home'],
            [
                'category' => 'therapy',
                'message' => 'Emma used picture cards to request snacks four times over the weekend.',
                'status' => 'open',
            ]
        );

        if ($psychometrician) {
            $assessment = Assessment::updateOrCreate(
                ['child_id' => $lucas->id, 'notes' => 'Mobile demo assessment for AI review.'],
                [
                    'assessment_checklist_id' => $checklist->id,
                    'psychometrician_id' => $psychometrician->id,
                    'severity_level' => 'moderate',
                    'conditions_json' => ['developmental'],
                    'status' => 'finalized',
                ]
            );

            AssessmentResponse::updateOrCreate(
                ['assessment_id' => $assessment->id, 'checklist_item_id' => $item->id],
                ['score' => '2', 'comment' => null]
            );

            AiRecommendation::updateOrCreate(
                ['assessment_id' => $assessment->id, 'status' => 'pending_review'],
                [
                    'child_id' => $lucas->id,
                    'prompt_payload' => ['child' => ['id' => $lucas->id, 'age_band' => 7]],
                    'openai_response_json' => [
                        'developmental_summary' => 'Lucas shows steady progress in structured tasks. Focus on communication and fine motor pairing.',
                        'focus_areas' => ['communication', 'motor skills'],
                        'suggested_activities' => [
                            [
                                'title' => 'Picture exchange activity',
                                'rationale' => 'Supports request-making and social initiation.',
                            ],
                        ],
                        'intervention_suggestions' => [
                            'Short structured sessions with visual supports.',
                            'Pair activities with positive reinforcement.',
                        ],
                    ],
                ]
            );
        }

        if (LearningMaterial::count() === 0) {
            LearningMaterial::create([
                'title' => 'Picture Exchange Cards',
                'description' => 'Visual prompts for requesting items and activities.',
                'type' => 'visual',
                'tags' => ['communication', 'social'],
                'uploaded_by' => $teacher->id,
            ]);
        }

        foreach ([$teacher, $caretaker, $parent] as $user) {
            Notification::updateOrCreate(
                ['user_id' => $user->id, 'topic' => 'mobile-demo-welcome'],
                [
                    'type' => 'system.welcome',
                    'title' => 'Welcome to SmartCare',
                    'body' => 'Your demo data is ready. Explore your assigned children and tasks.',
                ]
            );
        }

        $this->command?->info('Mobile demo data seeded for mobile_teacher, mobile_caretaker, mobile_parent.');
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, string>  $assignments
     */
    private function upsertChild(string $first, string $last, array $attributes, array $assignments): Child
    {
        $child = Child::updateOrCreate(
            ['first_name' => $first, 'last_name' => $last],
            [...$attributes, 'is_active' => true]
        );

        foreach ($assignments as $userId => $relation) {
            $child->users()->syncWithoutDetaching([$userId => ['relation' => $relation]]);
        }

        return $child;
    }
}
