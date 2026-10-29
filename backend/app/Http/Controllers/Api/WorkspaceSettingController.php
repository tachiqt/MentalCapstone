<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WorkspaceSetting;
use App\Support\QueryCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkspaceSettingController extends Controller
{
    public function show(): JsonResponse
    {
        $settings = QueryCache::remember(QueryCache::WORKSPACE, 600, function () {
            return WorkspaceSetting::keyed();
        });

        return response()->json($settings);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'facility_name' => ['required', 'string', 'min:2', 'max:120'],
            'timezone' => ['required', 'timezone'],
            'default_session_minutes' => ['required', 'integer', 'min:15', 'max:480'],
            'reminder_lead_minutes' => ['required', 'integer', 'min:0', 'max:180'],
        ]);

        WorkspaceSetting::putValue('facility_name', $data['facility_name']);
        WorkspaceSetting::putValue('timezone', $data['timezone']);
        WorkspaceSetting::putValue('default_session_minutes', (string) $data['default_session_minutes']);
        WorkspaceSetting::putValue('reminder_lead_minutes', (string) $data['reminder_lead_minutes']);

        QueryCache::forget(QueryCache::WORKSPACE);

        return response()->json(WorkspaceSetting::keyed());
    }
}
