<?php

namespace App\Observers;

use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Model;

class WorkspaceActivityObserver
{
    public function __construct(private NotificationService $notifications) {}

    public function created(Model $model): void
    {
        $this->notifications->fromModel('created', $model);
    }

    public function updated(Model $model): void
    {
        $this->notifications->fromModel('updated', $model);
    }

    public function deleted(Model $model): void
    {
        $this->notifications->fromModel('deleted', $model);
    }
}
