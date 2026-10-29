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
use App\Models\WorkspaceSetting;
use App\Services\MediaStorage;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class SampleDataSeeder extends Seeder
{
    private User $headDoctor;

    private User $psychometrician;

    private User $teacher;

    private User $teacher2;

    private User $caretaker;

    private User $parent;

    private User $parent2;

    private AssessmentChecklist $baselineChecklist;

    private AssessmentChecklist $socialChecklist;

    /** @var array<int, ChecklistItem> */
    private array $baselineItems = [];

    /** @var array<int, ChecklistItem> */
    private array $socialItems = [];

    /** @var array<int, LearningMaterial> */
    private array $materials = [];

    public function run(): void
    {
        $password = Hash::make('password');

        $this->seedUsers($password);
        $this->seedWorkspaceSettings();
        $this->seedChecklists();
        $this->seedLearningMaterials();

        $alex = $this->seedChild([
            'first_name' => 'Alex',
            'last_name' => 'Sample',
            'birth_date' => '2018-05-01',
            'sex' => 'male',
            'diagnosis' => 'Autism spectrum — moderate support',
            'condition_notes' => 'Responds well to visual schedules and short tasks.',
            'age_band' => 7,
        ], [
            $this->teacher->id => 'teacher',
            $this->caretaker->id => 'caretaker',
            $this->parent->id => 'parent',
        ]);

        $mia = $this->seedChild([
            'first_name' => 'Mia',
            'last_name' => 'Santos',
            'birth_date' => '2019-03-14',
            'sex' => 'female',
            'diagnosis' => 'Speech and language delay',
            'condition_notes' => 'Uses picture exchange for requests at home.',
            'age_band' => 6,
        ], [
            $this->teacher->id => 'teacher',
            $this->caretaker->id => 'caretaker',
            $this->parent2->id => 'parent',
        ]);

        $sofia = $this->seedChild([
            'first_name' => 'Sofia',
            'last_name' => 'Reyes',
            'birth_date' => '2017-11-22',
            'sex' => 'female',
            'diagnosis' => 'ADHD — combined presentation',
            'condition_notes' => 'Benefits from movement breaks between tasks.',
            'age_band' => 8,
        ], [
            $this->teacher2->id => 'teacher',
            $this->parent->id => 'parent',
        ]);

        $noah = $this->seedChild([
            'first_name' => 'Noah',
            'last_name' => 'Cruz',
            'birth_date' => '2020-07-08',
            'sex' => 'male',
            'diagnosis' => 'Under evaluation',
            'condition_notes' => 'New intake — awaiting first formal assessment.',
            'age_band' => 5,
        ], [
            $this->teacher->id => 'teacher',
            $this->parent2->id => 'parent',
        ]);

        // Alex: approved AI path + therapy + medication (full facility story)
        $alexApproved = $this->seedAssessment(
            $alex,
            $this->baselineChecklist,
            $this->baselineItems,
            ['2', '2', '1', '2'],
            'moderate',
            now()->subWeeks(3),
            'Initial baseline completed during intake week.'
        );
        $alexRecApproved = $this->seedRecommendation(
            $alexApproved,
            'approved',
            $this->teacher,
            now()->subWeeks(2),
            'Plan aligns with classroom goals and home practice.'
        );
        $alexPlan = TherapyPlan::create([
            'child_id' => $alex->id,
            'teacher_id' => $this->teacher->id,
            'ai_recommendation_id' => $alexRecApproved->id,
            'title' => 'Communication & fine motor support',
            'description' => 'Structured sessions using visual supports and sensory play.',
            'sessions_per_week' => 3,
            'status' => 'active',
        ]);

        TherapySession::create([
            'therapy_plan_id' => $alexPlan->id,
            'child_id' => $alex->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => now()->subDays(5)->setTime(10, 0),
            'duration_minutes' => 45,
            'status' => 'completed',
            'participation' => 'engaged',
            'observations' => 'Stayed on task for 20 minutes with one prompt.',
            'outcomes' => 'Completed matching activity independently.',
        ]);

        TherapySession::create([
            'therapy_plan_id' => $alexPlan->id,
            'child_id' => $alex->id,
            'teacher_id' => $this->teacher->id,
            'scheduled_at' => now()->addDays(2)->setTime(14, 0),
            'duration_minutes' => 45,
            'status' => 'scheduled',
        ]);

        // Mia: assessment this week awaiting teacher review
        $miaAssessment = $this->seedAssessment(
            $mia,
            $this->socialChecklist,
            $this->socialItems,
            ['2', '1', '2'],
            'mild',
            now()->subDays(2),
            'Social communication screening for quarterly review.'
        );
        $this->seedRecommendation($miaAssessment, 'pending_review');

        // Sofia: assessment ready for AI generation (no recommendation yet)
        $this->seedAssessment(
            $sofia,
            $this->baselineChecklist,
            $this->baselineItems,
            ['1', '2', '2', '1'],
            'mild',
            now()->subDay(),
            'Scores entered — psychometrician to request AI draft.'
        );

        // Psycho also submitted Alex follow-up this week (shows weekly count)
        $this->seedAssessment(
            $alex,
            $this->baselineChecklist,
            $this->baselineItems,
            ['3', '2', '2', '3'],
            'mild',
            now()->subDays(1),
            'Follow-up showing improvement in focus and motor tasks.'
        );

        $melatonin = MedicationSchedule::create([
            'child_id' => $alex->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Melatonin',
            'dosage' => '3mg',
            'instructions' => 'Give 30 minutes before bedtime with water.',
            'time_of_day' => '20:00:00',
            'days_of_week' => [0, 1, 2, 3, 4, 5, 6],
            'is_active' => true,
        ]);

        MedicationLog::create([
            'medication_schedule_id' => $melatonin->id,
            'child_id' => $alex->id,
            'caretaker_id' => $this->caretaker->id,
            'status' => 'given',
            'administered_at' => now()->subDay()->setTime(20, 5),
            'notes' => 'Taken without issue.',
        ]);

        MedicationSchedule::create([
            'child_id' => $mia->id,
            'created_by' => $this->teacher->id,
            'medicine_name' => 'Vitamin D',
            'dosage' => '400 IU',
            'instructions' => 'With breakfast.',
            'time_of_day' => '08:00:00',
            'days_of_week' => [1, 2, 3, 4, 5],
            'is_active' => true,
        ]);

        ProgressRecord::create([
            'child_id' => $alex->id,
            'recorded_by' => $this->teacher->id,
            'title' => 'Matching activity milestone',
            'summary' => 'Matched 8 of 10 picture cards without verbal prompts.',
            'milestone' => 'Independent matching',
            'recorded_on' => now()->subDays(4)->toDateString(),
        ]);

        ProgressRecord::create([
            'child_id' => $mia->id,
            'recorded_by' => $this->teacher->id,
            'title' => 'Peer greeting practice',
            'summary' => 'Initiated wave to classmate during circle time.',
            'milestone' => 'Social initiation',
            'recorded_on' => now()->subDays(6)->toDateString(),
        ]);

        ParentFeedback::create([
            'parent_id' => $this->parent->id,
            'child_id' => $alex->id,
            'subject' => 'Home routine update',
            'category' => 'communication',
            'message' => 'We practiced the visual schedule twice daily this week. Bedtime routine is smoother.',
            'status' => 'open',
        ]);

        ParentFeedback::create([
            'parent_id' => $this->parent2->id,
            'child_id' => $mia->id,
            'subject' => 'Speech practice at home',
            'category' => 'therapy',
            'message' => 'Mia used two-word requests four times over the weekend using picture cards.',
            'status' => 'open',
        ]);

        Notification::create([
            'user_id' => $this->headDoctor->id,
            'type' => 'record.assessment',
            'topic' => 'sample-assessment-mia',
            'title' => 'New assessment submitted',
            'body' => 'Mia Santos — Social-Communication Screening awaiting AI review pipeline.',
        ]);

        Notification::create([
            'user_id' => $this->psychometrician->id,
            'type' => 'record.assessment',
            'topic' => 'sample-assessment-sofia',
            'title' => 'Assessment ready for AI',
            'body' => 'Sofia Reyes baseline scores are finalized. Generate AI recommendation when ready.',
        ]);

        Notification::create([
            'user_id' => $this->teacher->id,
            'type' => 'review.recommendation',
            'topic' => 'sample-review-mia',
            'title' => 'AI recommendation pending review',
            'body' => 'Mia Santos has a recommendation waiting for your approval.',
        ]);
    }

    private function seedUsers(string $password): void
    {
        $this->headDoctor = User::create([
            'name' => 'Head Doctor',
            'username' => 'headdoctor',
            'email' => 'headdoctor@smartcare.local',
            'phone' => '+63 917 000 0001',
            'password' => $password,
            'role' => UserRole::HeadDoctor,
            'status' => 'active',
        ]);

        $this->psychometrician = User::create([
            'name' => 'Pat Psychometrician',
            'username' => 'psycho',
            'email' => 'psycho@smartcare.local',
            'phone' => '+63 917 000 0002',
            'password' => $password,
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        User::create([
            'name' => 'Jordan Psychometrician',
            'username' => 'psycho2',
            'email' => 'psycho2@smartcare.local',
            'password' => $password,
            'role' => UserRole::Psychometrician,
            'status' => 'active',
        ]);

        $this->teacher = User::create([
            'name' => 'Tess Teacher',
            'username' => 'teacher',
            'email' => 'teacher@smartcare.local',
            'phone' => '+63 917 000 0003',
            'password' => $password,
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->teacher2 = User::create([
            'name' => 'Marco Teacher',
            'username' => 'teacher2',
            'email' => 'teacher2@smartcare.local',
            'password' => $password,
            'role' => UserRole::Teacher,
            'status' => 'active',
        ]);

        $this->caretaker = User::create([
            'name' => 'Cara Caretaker',
            'username' => 'caretaker',
            'email' => 'caretaker@smartcare.local',
            'phone' => '+63 917 000 0004',
            'password' => $password,
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        User::create([
            'name' => 'Ben Caretaker',
            'username' => 'caretaker2',
            'email' => 'caretaker2@smartcare.local',
            'password' => $password,
            'role' => UserRole::Caretaker,
            'status' => 'active',
        ]);

        $this->parent = User::create([
            'name' => 'Parent Guardian',
            'username' => 'parent',
            'email' => 'parent@smartcare.local',
            'phone' => '+63 917 000 0005',
            'password' => $password,
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        $this->parent2 = User::create([
            'name' => 'Rosa Guardian',
            'username' => 'parent2',
            'email' => 'parent2@smartcare.local',
            'phone' => '+63 917 000 0006',
            'password' => $password,
            'role' => UserRole::Parent,
            'status' => 'active',
        ]);

        // Demo accounts exist to be signed into, and login rejects anyone whose
        // email is unverified, so stamp them the way MobileTestAccountsSeeder does.
        User::query()->whereNull('email_verified_at')->update(['email_verified_at' => now()]);
    }

    private function seedWorkspaceSettings(): void
    {
        foreach ([
            'facility_name' => 'Malvar Assisted Facility',
            'timezone' => 'Asia/Manila',
            'default_session_minutes' => '45',
            'reminder_lead_minutes' => '15',
        ] as $key => $value) {
            WorkspaceSetting::putValue($key, $value);
        }
    }

    private function seedChecklists(): void
    {
        $this->baselineChecklist = AssessmentChecklist::create([
            'title' => 'Developmental Baseline Checklist',
            'description' => 'Core domains for initial and follow-up evaluation.',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        foreach ([
            ['prompt' => 'Attention and focus during structured tasks', 'domain' => 'cognitive', 'sort_order' => 1],
            ['prompt' => 'Expressive communication attempts', 'domain' => 'communication', 'sort_order' => 2],
            ['prompt' => 'Peer interaction comfort', 'domain' => 'social', 'sort_order' => 3],
            ['prompt' => 'Fine motor engagement with materials', 'domain' => 'motor', 'sort_order' => 4],
        ] as $item) {
            $this->baselineItems[] = ChecklistItem::create([
                'assessment_checklist_id' => $this->baselineChecklist->id,
                ...$item,
            ]);
        }

        $this->socialChecklist = AssessmentChecklist::create([
            'title' => 'Social-Communication Screening',
            'description' => 'Focused items for speech and social participation reviews.',
            'created_by' => $this->headDoctor->id,
            'is_active' => true,
        ]);

        foreach ([
            ['prompt' => 'Initiates interaction with peers or adults', 'domain' => 'social', 'sort_order' => 1],
            ['prompt' => 'Uses words or symbols to make requests', 'domain' => 'communication', 'sort_order' => 2],
            ['prompt' => 'Maintains joint attention during activities', 'domain' => 'communication', 'sort_order' => 3],
        ] as $item) {
            $this->socialItems[] = ChecklistItem::create([
                'assessment_checklist_id' => $this->socialChecklist->id,
                ...$item,
            ]);
        }
    }

    private function seedLearningMaterials(): void
    {
        // Must be the same disk LearningMaterial::getFileUrlAttribute() reads from,
        // otherwise the seeded material advertises a Cloud Storage URL for a file
        // that only exists on the local public disk.
        $mediaDisk = Storage::disk(app(MediaStorage::class)->diskName());

        $sampleImagePath = 'learning-materials/picture-exchange-preview.jpg';
        $sampleSource = public_path('web/assets/landing/hero.png');
        if (! $mediaDisk->exists($sampleImagePath) && is_file($sampleSource)) {
            $mediaDisk->put($sampleImagePath, file_get_contents($sampleSource), ['visibility' => 'public']);
        }

        $catalog = [
            [
                'title' => 'Picture Exchange Cards',
                'description' => 'Visual prompts for requesting items and activities.',
                'type' => 'visual',
                'tags' => ['communication', 'social'],
                'file_path' => $mediaDisk->exists($sampleImagePath) ? $sampleImagePath : null,
            ],
            [
                'title' => 'Sensory Play Kit Guide',
                'description' => 'Activities for fine motor and regulation support.',
                'type' => 'guide',
                'tags' => ['motor', 'sensory'],
            ],
            [
                'title' => 'Daily Visual Schedule Template',
                'description' => 'Printable routine cards for home and classroom.',
                'type' => 'worksheet',
                'tags' => ['communication', 'routine'],
            ],
            [
                'title' => 'Turn-Taking Board Game',
                'description' => 'Simple game for peer interaction practice.',
                'type' => 'activity',
                'tags' => ['social', 'cognitive'],
            ],
        ];

        foreach ($catalog as $row) {
            $this->materials[] = LearningMaterial::create([
                ...$row,
                'uploaded_by' => $this->headDoctor->id,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, string>  $assignments  user_id => relation
     */
    private function seedChild(array $attributes, array $assignments): Child
    {
        $child = Child::create([
            ...$attributes,
            'is_active' => true,
        ]);

        foreach ($assignments as $userId => $relation) {
            $child->users()->attach($userId, ['relation' => $relation]);
        }

        return $child;
    }

    /**
     * @param  array<int, ChecklistItem>  $items
     * @param  array<int, string>  $scores
     */
    private function seedAssessment(
        Child $child,
        AssessmentChecklist $checklist,
        array $items,
        array $scores,
        string $severity,
        Carbon $submittedAt,
        string $notes
    ): Assessment {
        $assessment = Assessment::create([
            'child_id' => $child->id,
            'assessment_checklist_id' => $checklist->id,
            'psychometrician_id' => $this->psychometrician->id,
            'severity_level' => $severity,
            'conditions_json' => [$child->diagnosis ? 'developmental' : 'general'],
            'notes' => $notes,
            'status' => 'finalized',
            'created_at' => $submittedAt,
            'updated_at' => $submittedAt,
        ]);

        foreach ($items as $index => $item) {
            AssessmentResponse::create([
                'assessment_id' => $assessment->id,
                'checklist_item_id' => $item->id,
                'score' => $scores[$index] ?? '1',
                'comment' => null,
            ]);
        }

        return $assessment;
    }

    private function seedRecommendation(
        Assessment $assessment,
        string $status,
        ?User $reviewer = null,
        ?Carbon $reviewedAt = null,
        ?string $teacherNotes = null
    ): AiRecommendation {
        $material = $this->materials[0] ?? null;

        return AiRecommendation::create([
            'child_id' => $assessment->child_id,
            'assessment_id' => $assessment->id,
            'prompt_payload' => [
                'child' => [
                    'id' => $assessment->child_id,
                    'age_band' => $assessment->child?->age_band,
                ],
                'severity_level' => $assessment->severity_level,
            ],
            'openai_response_json' => [
                'developmental_summary' => 'Sample AI draft based on encoded checklist scores.',
                'focus_areas' => ['communication', 'social skills'],
                'suggested_activities' => [
                    [
                        'material_id' => $material?->id,
                        'title' => $material?->title ?? 'Picture exchange activity',
                        'rationale' => 'Supports request-making and social initiation.',
                    ],
                ],
                'intervention_suggestions' => [
                    'Short structured sessions with visual supports.',
                    'Pair activities with positive reinforcement.',
                ],
                'caution' => 'Learning activity suggestions only. Professional review required.',
            ],
            'status' => $status,
            'reviewed_by' => $reviewer?->id,
            'teacher_notes' => $teacherNotes,
            'reviewed_at' => $reviewedAt,
        ]);
    }
}
