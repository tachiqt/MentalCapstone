<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\AssessmentChecklist;
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
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class NotificationService
{
    public function fromModel(string $action, Model $model): void
    {
        $actor = auth()->user();
        if (! $actor instanceof User) {
            return;
        }

        if ($action === 'updated' && ! $this->modelWasMeaningfullyChanged($model)) {
            return;
        }

        $meta = $this->describe($action, $model);
        if (! $meta) {
            return;
        }

        if ($model instanceof User && $action === 'updated' && (int) $actor->id === (int) $model->id) {
            $this->notifyUser($model, 'account.updated', $meta['title'], $meta['body'], $meta['data']);

            return;
        }

        // Web staff keep seeing their own actions; the dashboard feed doubles as an
        // audit trail. Only the mobile fan-out below skips the actor.
        $this->notifyWebStaff($meta['type'], $meta['title'], $meta['body'], $meta['data']);

        $route = $this->routeFor($model);

        if ($route['roles'] !== []) {
            $this->notifyRoles($route['roles'], $meta['type'], $meta['title'], $meta['body'], $meta['data'], null, $actor);

            return;
        }

        $this->notifyChildCircle(
            $this->childFor($model),
            $route['relations'],
            $meta['type'],
            $meta['title'],
            $meta['body'],
            $meta['data'],
            null,
            $actor
        );
    }

    /**
     * Decides who, beyond web staff, should hear about a change to this model.
     *
     * `relations` are child_user pivot relations, resolved against the model's own
     * child. `roles` bypass the child link entirely, for workspace-wide records.
     *
     * @return array{relations: array<int, string>, roles: array<int, UserRole>}
     */
    private function routeFor(Model $model): array
    {
        $all = ['teacher', 'caretaker', 'parent'];

        $relations = match (true) {
            $model instanceof Child => $all,
            $model instanceof TherapySession => $all,
            $model instanceof TherapyPlan => ['teacher', 'parent'],
            $model instanceof MedicationSchedule => ['caretaker', 'teacher', 'parent'],
            // The caretaker who logged the dose is the actor and is filtered out anyway.
            $model instanceof MedicationLog => ['teacher', 'parent'],
            $model instanceof ProgressRecord => $all,
            // Authored by the parent, so it is the teaching side that needs to know.
            $model instanceof ParentFeedback => ['teacher', 'caretaker'],
            $model instanceof AiRecommendation => $this->recommendationRelations($model),
            $model instanceof Assessment => ['teacher', 'parent'],
            default => [],
        };

        // Materials are a shared library with no child, so they go out by role.
        $roles = $model instanceof LearningMaterial
            ? [UserRole::Teacher, UserRole::Caretaker, UserRole::Parent]
            : [];

        return ['relations' => $relations, 'roles' => $roles];
    }

    /**
     * A freshly generated plan is the teacher's job to review; once reviewed, the
     * outcome is what the family and caretaker care about.
     *
     * @return array<int, string>
     */
    private function recommendationRelations(AiRecommendation $model): array
    {
        return $model->status === 'pending_review'
            ? ['teacher']
            : ['parent', 'caretaker'];
    }

    private function childFor(Model $model): ?Child
    {
        if ($model instanceof Child) {
            return $model;
        }

        if (! isset($model->child_id) || ! method_exists($model, 'child')) {
            return null;
        }

        $model->loadMissing('child');

        $child = $model->getRelationValue('child');

        return $child instanceof Child ? $child : null;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function notifyWebStaff(string $type, string $title, ?string $body = null, array $data = [], ?string $topic = null, ?User $except = null): void
    {
        $this->deliver(
            User::query()
                ->where('status', 'active')
                ->whereIn('role', [UserRole::HeadDoctor, UserRole::Psychometrician])
                ->get(),
            $type,
            $title,
            $body,
            $data,
            $topic,
            $except
        );
    }

    /**
     * Notifies the people attached to a single child, limited to the given pivot
     * relations. This is the mobile counterpart to notifyWebStaff: it uses the same
     * child_user pivot that ChildAccess uses for read scoping, so a user is only
     * ever told about a child they are already allowed to see.
     *
     * @param  array<int, string>  $relations
     * @param  array<string, mixed>  $data
     */
    public function notifyChildCircle(?Child $child, array $relations, string $type, string $title, ?string $body = null, array $data = [], ?string $topic = null, ?User $except = null): void
    {
        if (! $child instanceof Child || $relations === []) {
            return;
        }

        $this->deliver(
            $child->users()
                ->wherePivotIn('relation', $relations)
                ->where('users.status', 'active')
                ->get(),
            $type,
            $title,
            $body,
            $data,
            $topic,
            $except
        );
    }

    /**
     * Notifies every active user in the given roles regardless of child links, for
     * workspace-wide events such as a new learning material.
     *
     * @param  array<int, UserRole>  $roles
     * @param  array<string, mixed>  $data
     */
    public function notifyRoles(array $roles, string $type, string $title, ?string $body = null, array $data = [], ?string $topic = null, ?User $except = null): void
    {
        if ($roles === []) {
            return;
        }

        $this->deliver(
            User::query()
                ->where('status', 'active')
                ->whereIn('role', $roles)
                ->get(),
            $type,
            $title,
            $body,
            $data,
            $topic,
            $except
        );
    }

    /**
     * Fans a single notification out to a recipient set, skipping the actor and
     * de-duplicating so a user linked to one child twice is notified once.
     *
     * @param  \Illuminate\Support\Collection<int, User>|\Illuminate\Database\Eloquent\Collection<int, User>  $users
     * @param  array<string, mixed>  $data
     */
    private function deliver($users, string $type, string $title, ?string $body, array $data, ?string $topic, ?User $except): void
    {
        $exceptId = $except?->id;

        $users
            ->unique('id')
            ->reject(fn (User $user) => $exceptId !== null && (int) $user->id === (int) $exceptId)
            ->each(function (User $user) use ($type, $title, $body, $data, $topic) {
                // Topics dedupe on (user_id, topic), so each recipient needs its own key.
                $this->notifyUser($user, $type, $title, $body, $data, $topic ? $topic.'.u'.$user->id : null);
            });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function notifyUser(User $user, string $type, string $title, ?string $body = null, array $data = [], ?string $topic = null): void
    {
        $prefs = is_array($user->preferences) ? $user->preferences : [];
        $isSchedule = str_starts_with($type, 'schedule.');
        if ($isSchedule && ($prefs['notify_schedules'] ?? true) === false) {
            return;
        }
        if (! $isSchedule && ($prefs['notify_records'] ?? true) === false) {
            return;
        }

        if ($topic) {
            Notification::query()->firstOrCreate(
                [
                    'user_id' => $user->id,
                    'topic' => $topic,
                ],
                [
                    'type' => $type,
                    'title' => $title,
                    'body' => $body,
                    'data' => $data,
                ]
            );

            return;
        }

        Notification::query()->create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'data' => $data,
        ]);
    }

    public function syncDueReminders(): void
    {
        $tz = WorkspaceSetting::getValue('timezone', 'Asia/Manila');
        $lead = max(0, (int) WorkspaceSetting::getValue('reminder_lead_minutes', '0'));
        $now = Carbon::now($tz);

        $this->syncTherapyDue($now, $tz, $lead);
        $this->syncMedicationDue($now, $tz, $lead);
    }

    private function syncTherapyDue(Carbon $now, string $tz, int $lead): void
    {
        TherapySession::query()
            ->with('child:id,first_name,last_name')
            ->where('status', 'scheduled')
            ->where('scheduled_at', '<=', $now->copy()->addMinutes($lead))
            ->where('scheduled_at', '>=', $now->copy()->subHours(12))
            ->get()
            ->each(function (TherapySession $session) use ($now, $tz) {
                $when = $session->scheduled_at?->timezone($tz);
                $child = trim(($session->child?->first_name ?? '').' '.($session->child?->last_name ?? ''));
                $label = $child !== '' ? $child : 'a child';
                $title = 'Therapy session is due';
                $body = $label.' has a session at '.($when?->format('g:i A') ?? $now->format('g:i A')).'.';
                $data = ['section' => 'therapy', 'id' => $session->id];
                $topic = 'therapy.due.'.$session->id;

                $this->notifyWebStaff('schedule.therapy', $title, $body, $data, $topic);

                $this->notifyChildCircle(
                    $session->child,
                    ['teacher', 'caretaker', 'parent'],
                    'schedule.therapy',
                    $title,
                    $body,
                    $data,
                    $topic
                );
            });
    }

    private function syncMedicationDue(Carbon $now, string $tz, int $lead): void
    {
        $todayDow = (int) $now->dayOfWeek;

        MedicationSchedule::query()
            ->with('child:id,first_name,last_name')
            ->where('is_active', true)
            ->get()
            ->each(function (MedicationSchedule $schedule) use ($now, $tz, $lead, $todayDow) {
                $days = is_array($schedule->days_of_week) ? array_map('intval', $schedule->days_of_week) : [];
                if ($days !== [] && ! in_array($todayDow, $days, true)) {
                    return;
                }

                $times = $schedule->times_of_day ?: array_filter([(string) $schedule->time_of_day]);
                $child = trim(($schedule->child?->first_name ?? '').' '.($schedule->child?->last_name ?? ''));
                $label = $child !== '' ? $child : 'a child';

                foreach ($times as $time) {
                    $hm = substr((string) $time, 0, 5);
                    if (! preg_match('/^\d{2}:\d{2}$/', $hm)) {
                        continue;
                    }
                    $due = Carbon::createFromFormat('Y-m-d H:i', $now->toDateString().' '.$hm, $tz);
                    if (! $due) {
                        continue;
                    }
                    $windowStart = $due->copy()->subMinutes($lead);
                    $windowEnd = $due->copy()->addHours(2);
                    if (! $now->betweenIncluded($windowStart, $windowEnd)) {
                        continue;
                    }

                    $title = 'Medication time reached';
                    $body = $label.' is due for '.$schedule->medicine_name.' at '.$due->format('g:i A').'.';
                    $data = ['section' => 'medication', 'id' => $schedule->id];
                    $topic = 'medication.due.'.$schedule->id.'.'.$now->toDateString().'.'.$hm;

                    $this->notifyWebStaff('schedule.medication', $title, $body, $data, $topic);

                    // The caretaker is the one who has to log the dose, so they lead here.
                    $this->notifyChildCircle(
                        $schedule->child,
                        ['caretaker', 'teacher', 'parent'],
                        'schedule.medication',
                        $title,
                        $body,
                        $data,
                        $topic
                    );
                }
            });
    }

    /**
     * @return array{type: string, title: string, body: ?string, data: array<string, mixed>}|null
     */
    private function describe(string $action, Model $model): ?array
    {
        $verb = match ($action) {
            'created' => 'added',
            'deleted' => 'deleted',
            default => 'updated',
        };

        return match (true) {
            $model instanceof Child => [
                'type' => 'record.child',
                'title' => 'Child record '.$verb,
                'body' => trim($model->first_name.' '.$model->last_name).' was '.$verb.'.',
                'data' => ['section' => 'children', 'id' => $model->id],
            ],
            $model instanceof TherapySession => $this->sessionMeta($action, $model, $verb),
            $model instanceof MedicationSchedule => [
                'type' => 'record.medication',
                'title' => 'Medication schedule '.$verb,
                'body' => ($model->medicine_name ?: 'A medication plan').' was '.$verb.'.',
                'data' => ['section' => 'medication', 'id' => $model->id],
            ],
            $model instanceof MedicationLog => [
                'type' => 'record.medication_log',
                'title' => 'Medication log recorded',
                'body' => 'A dose was logged as '.$model->status.'.',
                'data' => ['section' => 'medication', 'id' => $model->medication_schedule_id],
            ],
            $model instanceof ProgressRecord => [
                'type' => 'record.progress',
                'title' => 'Progress update '.$verb,
                'body' => ($model->title ?: 'A milestone').' was '.$verb.'.',
                'data' => ['section' => 'children', 'id' => $model->child_id],
            ],
            $model instanceof TherapyPlan => [
                'type' => 'record.therapy_plan',
                'title' => 'Therapy plan '.$verb,
                'body' => ($model->title ?: 'A therapy plan').' was '.$verb.'.',
                'data' => ['section' => 'therapy', 'id' => $model->id],
            ],
            $model instanceof AssessmentChecklist => [
                'type' => 'record.checklist',
                'title' => 'Checklist '.$verb,
                'body' => ($model->title ?: 'A checklist').' was '.$verb.'.',
                'data' => ['section' => 'checklists', 'id' => $model->id],
            ],
            $model instanceof Assessment => $this->assessmentMeta($model),
            $model instanceof LearningMaterial => [
                'type' => 'record.material',
                'title' => 'Learning material '.$verb,
                'body' => ($model->title ?: 'A resource').' was '.$verb.'.',
                'data' => ['section' => 'materials', 'id' => $model->id],
            ],
            $model instanceof AiRecommendation => [
                'type' => 'record.recommendation',
                'title' => 'AI recommendation '.$verb,
                'body' => 'A learning suggestion is now '.$model->status.'.',
                'data' => ['section' => 'assessments', 'id' => $model->assessment_id],
            ],
            $model instanceof ParentFeedback => [
                'type' => 'record.feedback',
                'title' => 'Parent feedback '.$verb,
                'body' => $this->feedbackPreview($model),
                'data' => [
                    'section' => 'children',
                    'id' => $model->child_id,
                    'feedback_id' => $model->id,
                    'tab' => 'progress',
                ],
            ],
            $model instanceof User => [
                'type' => 'record.staff',
                'title' => 'Staff account '.$verb,
                'body' => ($model->name ?: 'An account').' was '.$verb.'.',
                'data' => ['section' => 'staff', 'id' => $model->id],
            ],
            default => null,
        };
    }

    private function feedbackPreview(ParentFeedback $model): string
    {
        $subject = trim((string) ($model->subject ?: 'Parent update'));
        $message = trim((string) ($model->message ?: ''));
        if ($message === '') {
            return $subject.' was added.';
        }
        $preview = mb_strlen($message) > 120 ? mb_substr($message, 0, 117).'…' : $message;

        return $subject.': '.$preview;
    }

    /**
     * @return array{type: string, title: string, body: ?string, data: array<string, mixed>}
     */
    private function sessionMeta(string $action, TherapySession $model, string $verb): array
    {
        $model->loadMissing('child:id,first_name,last_name');
        $child = trim(($model->child?->first_name ?? '').' '.($model->child?->last_name ?? ''));
        $label = $child !== '' ? $child : 'A session';

        return [
            'type' => 'record.therapy',
            'title' => 'Therapy session '.$verb,
            'body' => $label.' was '.$verb.'.',
            'data' => ['section' => 'therapy', 'id' => $model->id],
        ];
    }

    /**
     * @return array{type: string, title: string, body: ?string, data: array<string, mixed>}
     */
    private function assessmentMeta(Assessment $model): array
    {
        $model->loadMissing('child:id,first_name,last_name');
        $child = trim(($model->child?->first_name ?? '').' '.($model->child?->last_name ?? ''));

        return [
            'type' => 'record.assessment',
            'title' => 'Assessment submitted',
            'body' => ($child !== '' ? $child : 'A child').' has a new assessment.',
            'data' => ['section' => 'assessments', 'id' => $model->id],
        ];
    }

    private function modelWasMeaningfullyChanged(Model $model): bool
    {
        $changes = array_keys($model->getChanges());
        $ignored = ['updated_at', 'remember_token'];

        return collect($changes)->reject(fn ($key) => in_array($key, $ignored, true))->isNotEmpty();
    }
}
