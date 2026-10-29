<?php

namespace App\Services;

use App\Models\AiRecommendation;
use App\Models\Assessment;
use App\Models\LearningMaterial;
use Illuminate\Support\Facades\Http;

class OpenAIRecommendationService
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
You are a senior special-education and developmental therapy planning assistant for Malvar Assisted Facility and Therapy Center.

Your job is to turn checklist assessment scores into a professional, actionable LEARNING SUPPORT PLAN for teachers and caretakers.

Hard rules:
- Recommend learning activities, teaching strategies, and progress monitoring only.
- Do NOT diagnose medical conditions.
- Do NOT suggest medication, dosage changes, or medical treatment.
- Base every recommendation on the assessment scores, severity, domains, comments, age band, and documented care notes provided.
- Prefer concrete, classroom/therapy-room ready steps over vague advice.
- When learning materials are provided, prefer matching those materials by tag/title when relevant; otherwise propose clear activity titles.
- Write in professional clinical-education tone (clear, respectful, specific).

Respond with JSON only using ALL of these keys:
{
  "developmental_summary": "string — 2 to 4 sentences synthesizing strengths, needs, and overall learning profile from the scores",
  "clinical_basis": "string — explicit rationale linking score patterns, low domains, severity, and notes to the plan (cite domains/score ranges in plain language)",
  "strengths": ["string — observed relative strengths from higher scores"],
  "focus_areas": ["string — short priority domain labels"],
  "priority_goals": [
    {
      "goal": "string — measurable learning goal",
      "timeframe": "string — e.g. 2 weeks / 4 weeks",
      "success_indicator": "string — observable success criteria",
      "basis": "string — which scores/domains justify this goal"
    }
  ],
  "suggested_activities": [
    {
      "material_id": "number or null",
      "title": "string",
      "duration_minutes": "number",
      "frequency": "string — e.g. 3x weekly, 10–15 min",
      "steps": ["string — ordered facilitation steps"],
      "rationale": "string — why this activity fits the child",
      "evidence_basis": "string — score/domain basis (e.g. low communication items averaging 1)"
    }
  ],
  "intervention_suggestions": [
    "string — detailed strategy teachers/caretakers can apply (prompt hierarchy, visuals, reinforcement, environment)"
  ],
  "home_school_strategies": [
    "string — practical carryover for home/school consistency"
  ],
  "progress_monitoring": [
    "string — how to track progress (what to observe, how often, what indicates improvement)"
  ],
  "session_structure": {
    "warm_up": "string",
    "core_block": "string",
    "cool_down": "string",
    "recommended_sessions_per_week": "number"
  },
  "caution": "string — mandatory human-review disclaimer; not a diagnosis"
}

Quality bar:
- Include 2–4 priority_goals.
- Include 3–5 suggested_activities with real steps (not one-liners only).
- Include at least 3 intervention_suggestions and 2 home_school_strategies.
- clinical_basis must reference assessment evidence, not generic claims.
PROMPT;

    public function generate(Assessment $assessment): AiRecommendation
    {
        $assessment->load(['child', 'responses.checklistItem', 'checklist']);

        $materials = LearningMaterial::query()
            ->select(['id', 'title', 'tags', 'description'])
            ->limit(30)
            ->get()
            ->map(fn ($m) => [
                'id' => $m->id,
                'title' => $m->title,
                'tags' => $m->tags ?? [],
                'description' => $m->description,
            ])
            ->values()
            ->all();

        $responses = $assessment->responses->map(fn ($r) => [
            'prompt' => $r->checklistItem?->prompt,
            'domain' => $r->checklistItem?->domain ?: 'General',
            'score' => $r->score,
            'comment' => $r->comment,
        ])->values()->all();

        $domainStats = $this->domainStats($responses);
        $scoreStats = $this->scoreStats($responses);

        $promptPayload = [
            'facility_context' => 'Assisted facility and therapy center serving children with special needs. Output must be practical for teachers and caretakers.',
            'child' => [
                'id' => $assessment->child_id,
                'age_band' => $assessment->child?->age_band,
                'sex' => $assessment->child?->sex,
                'diagnosis' => $assessment->child?->diagnosis,
                'condition_notes' => $assessment->child?->condition_notes,
            ],
            'assessment' => [
                'id' => $assessment->id,
                'checklist_title' => $assessment->checklist?->title,
                'checklist_category' => $assessment->checklist?->category,
                'severity_level' => $assessment->severity_level,
                'conditions' => $assessment->conditions_json ?? [],
                'notes' => $assessment->notes,
                'scoring_scale' => '0 = not observed, 1 = emerging, 2 = developing, 3 = consistent',
            ],
            'score_overview' => $scoreStats,
            'domain_performance' => $domainStats,
            'response_summary' => $responses,
            'available_learning_materials' => $materials,
            'output_expectations' => [
                'Be specific and professional.',
                'Tie every major recommendation to score evidence.',
                'Provide actionable steps, not slogans.',
            ],
        ];

        $useFake = ! config('openai.key')
            || app()->environment('testing')
            || config('openai.fake');

        $responseJson = $useFake
            ? $this->fakeResponse($promptPayload)
            : $this->callOpenAI($promptPayload);

        $responseJson = $this->normalizeResponse($responseJson, $promptPayload);

        return AiRecommendation::create([
            'child_id' => $assessment->child_id,
            'assessment_id' => $assessment->id,
            'prompt_payload' => $promptPayload,
            'openai_response_json' => $responseJson,
            'status' => 'pending_review',
        ]);
    }

    /**
     * @param  array<int, array{domain?: string, score?: mixed}>  $responses
     * @return array<int, array{domain: string, item_count: int, average_score: float, low_item_count: int}>
     */
    private function domainStats(array $responses): array
    {
        $buckets = [];
        foreach ($responses as $row) {
            $domain = trim((string) ($row['domain'] ?? 'General')) ?: 'General';
            $score = is_numeric($row['score'] ?? null) ? (float) $row['score'] : null;
            if (! isset($buckets[$domain])) {
                $buckets[$domain] = ['scores' => [], 'low' => 0];
            }
            if ($score === null) {
                continue;
            }
            $buckets[$domain]['scores'][] = $score;
            if ($score <= 1) {
                $buckets[$domain]['low']++;
            }
        }

        $out = [];
        foreach ($buckets as $domain => $data) {
            $scores = $data['scores'];
            $avg = count($scores) ? round(array_sum($scores) / count($scores), 2) : 0.0;
            $out[] = [
                'domain' => $domain,
                'item_count' => count($scores),
                'average_score' => $avg,
                'low_item_count' => $data['low'],
            ];
        }

        usort($out, fn ($a, $b) => $a['average_score'] <=> $b['average_score']);

        return $out;
    }

    /**
     * @param  array<int, array{score?: mixed}>  $responses
     * @return array{item_count: int, scored_count: int, average_score: float|null, low_score_count: int, high_score_count: int}
     */
    private function scoreStats(array $responses): array
    {
        $scores = [];
        foreach ($responses as $row) {
            if (is_numeric($row['score'] ?? null)) {
                $scores[] = (float) $row['score'];
            }
        }

        return [
            'item_count' => count($responses),
            'scored_count' => count($scores),
            'average_score' => count($scores) ? round(array_sum($scores) / count($scores), 2) : null,
            'low_score_count' => count(array_filter($scores, fn ($s) => $s <= 1)),
            'high_score_count' => count(array_filter($scores, fn ($s) => $s >= 2.5)),
        ];
    }

    private function fakeResponse(array $payload): array
    {
        $material = $payload['available_learning_materials'][0] ?? null;
        $domains = $payload['domain_performance'] ?? [];
        $lowest = $domains[0]['domain'] ?? 'communication';
        $second = $domains[1]['domain'] ?? 'fine motor skills';
        $avg = $payload['score_overview']['average_score'] ?? null;
        $severity = $payload['assessment']['severity_level'] ?? 'moderate';
        $lowCount = $payload['score_overview']['low_score_count'] ?? 0;
        $age = $payload['child']['age_band'] ?? null;
        $diagnosis = $payload['child']['diagnosis'] ?? null;

        $avgText = $avg === null ? 'incomplete scoring' : "an average score of {$avg}/3";
        $ageText = $age !== null ? "Age band {$age}" : 'Age band not specified';
        $dxText = $diagnosis ? "Documented care context notes {$diagnosis}." : 'No diagnosis label was provided; plan from scores only.';

        return [
            'developmental_summary' => "Assessment results show {$avgText} with {$lowCount} item(s) at emerging/not-observed levels. {$ageText}. Relative needs concentrate in {$lowest}"
                .($second ? " and {$second}" : '')
                .", while higher-scoring items indicate skills that can be used as teaching strengths. Severity was recorded as {$severity}. {$dxText}",
            'clinical_basis' => "Plan priority follows the lowest domain averages"
                .(isset($domains[0]) ? " ({$domains[0]['domain']} avg {$domains[0]['average_score']}"
                    .(isset($domains[1]) ? "; {$domains[1]['domain']} avg {$domains[1]['average_score']}" : '')
                    .')'
                : '')
                ." and {$lowCount} low-scoring checklist items. Severity ({$severity}) informs session length, prompt intensity, and monitoring frequency. Comments and care notes are used only to refine activity selection, not to invent a medical diagnosis.",
            'strengths' => [
                'Higher-scoring checklist items can serve as preferred entry points and reinforcement anchors.',
                'Responds best when expectations are broken into short, observable steps with clear success cues.',
            ],
            'focus_areas' => array_values(array_unique(array_filter([$lowest, $second, 'engagement & regulation']))),
            'priority_goals' => [
                [
                    'goal' => "Improve {$lowest} performance during structured tabletop or therapy-room tasks",
                    'timeframe' => '2–4 weeks',
                    'success_indicator' => 'Child completes 3 of 5 prompted trials with reduced adult support across 2 consecutive sessions',
                    'basis' => "Lowest domain average and {$lowCount} low item scores in assessment",
                ],
                [
                    'goal' => "Generalize emerging skills from {$lowest} into a second setting (therapy room → classroom/home routine)",
                    'timeframe' => '4 weeks',
                    'success_indicator' => 'Skill observed in a second setting at least twice weekly with visual or gesture prompt only',
                    'basis' => 'Need for carryover beyond assessment context; severity indicates structured practice is required',
                ],
            ],
            'suggested_activities' => [
                [
                    'material_id' => $material['id'] ?? null,
                    'title' => $material['title'] ?? 'Structured picture matching with turn-taking',
                    'duration_minutes' => 15,
                    'frequency' => '3–4x weekly',
                    'steps' => [
                        'Prepare 6–8 familiar picture cards and a clear start/finish visual.',
                        'Model one correct match, then use least-to-most prompting.',
                        'Require a brief communication attempt (point, word, or AAC) before each turn.',
                        'End with a preferred reinforcer tied to task completion, not speed.',
                    ],
                    'rationale' => 'Combines visual structure with communication practice while keeping motor demand manageable.',
                    'evidence_basis' => "Targets low {$lowest} items; uses available learning materials when tagged for communication/matching.",
                ],
                [
                    'material_id' => null,
                    'title' => 'Two-step routine with visual schedule strip',
                    'duration_minutes' => 10,
                    'frequency' => 'Daily short sessions',
                    'steps' => [
                        'Show a 2-box schedule (Do → Done).',
                        'Guide the child through one familiar step, then one emerging step.',
                        'Fade physical prompts first; keep visual prompt longer.',
                        'Record prompt level used on each trial.',
                    ],
                    'rationale' => 'Builds independence and reduces ambiguity for children needing moderate support.',
                    'evidence_basis' => "Severity {$severity} and low-score count ({$lowCount}) support highly structured short routines.",
                ],
                [
                    'material_id' => null,
                    'title' => 'Fine-motor warm-up paired with choice board',
                    'duration_minutes' => 8,
                    'frequency' => 'Before core learning block',
                    'steps' => [
                        'Offer two activity choices on a board.',
                        'Complete 1–2 minutes of simple grasp/release or peg work.',
                        'Transition immediately into the priority learning goal while engagement is high.',
                    ],
                    'rationale' => 'Uses regulation and motor readiness to improve learning availability.',
                    'evidence_basis' => 'Supports engagement before demanding communication/cognitive items.',
                ],
            ],
            'intervention_suggestions' => [
                'Use least-to-most prompting (gesture → model → partial physical) and record the prompt level that produces success.',
                'Keep instructions to one clear verb + object; pair with a visual whenever verbal comprehension items scored ≤1.',
                'Deliver reinforcement immediately after correct attempts; fade tangible reinforcers toward social praise within 2 weeks if engagement holds.',
                'Reduce distractions in the workspace (one tray, one set of materials) during priority-goal practice.',
            ],
            'home_school_strategies' => [
                'Share the same 2-step visual routine with home/school so language and expectations stay consistent.',
                'Ask caregivers to practice one target skill during a natural routine (e.g., choosing a snack with a choice board) for 3–5 minutes daily.',
            ],
            'progress_monitoring' => [
                'Score each priority goal weekly using the same 0–3 rubric used in assessment items.',
                'Log prompt level and independent successes per session; review after 4 sessions for fading decisions.',
                'Escalate for clinical review if regression appears across 3 consecutive sessions or safety concerns emerge.',
            ],
            'session_structure' => [
                'warm_up' => '2–3 min preferred/sensory settling + choice board',
                'core_block' => '8–12 min priority goal practice with visual supports and prompt hierarchy',
                'cool_down' => '2 min success review + reinforcer + preview of next session',
                'recommended_sessions_per_week' => 3,
            ],
            'caution' => 'Learning-support draft only. Not a medical diagnosis or prescription. A qualified professional must review and approve before use in an active therapy plan.',
        ];
    }

    private function callOpenAI(array $promptPayload): array
    {
        $response = Http::withToken(config('openai.key'))
            ->timeout(90)
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => config('openai.model'),
                'response_format' => ['type' => 'json_object'],
                'temperature' => 0.4,
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
                    ['role' => 'user', 'content' => json_encode($promptPayload, JSON_UNESCAPED_UNICODE)],
                ],
            ]);

        $response->throw();

        $content = $response->json('choices.0.message.content');

        return json_decode($content, true) ?? [];
    }

    /**
     * Ensure required keys exist so UI/mobile never receive an empty shell.
     */
    private function normalizeResponse(array $response, array $payload): array
    {
        if (empty($response)) {
            return $this->fakeResponse($payload);
        }

        $response['developmental_summary'] = trim((string) ($response['developmental_summary'] ?? ''));
        $response['clinical_basis'] = trim((string) ($response['clinical_basis'] ?? $response['developmental_summary']));
        $response['caution'] = trim((string) ($response['caution'] ?? 'Learning-support draft only. Professional review required. Not a diagnosis.'));
        $response['strengths'] = array_values(array_filter((array) ($response['strengths'] ?? [])));
        $response['focus_areas'] = array_values(array_filter((array) ($response['focus_areas'] ?? [])));
        $response['priority_goals'] = array_values((array) ($response['priority_goals'] ?? []));
        $response['suggested_activities'] = array_values((array) ($response['suggested_activities'] ?? []));
        $response['intervention_suggestions'] = array_values(array_filter((array) ($response['intervention_suggestions'] ?? [])));
        $response['home_school_strategies'] = array_values(array_filter((array) ($response['home_school_strategies'] ?? [])));
        $response['progress_monitoring'] = array_values(array_filter((array) ($response['progress_monitoring'] ?? [])));

        if ($response['developmental_summary'] === '' || ! $response['suggested_activities']) {
            $fallback = $this->fakeResponse($payload);

            return array_replace($fallback, array_filter($response, fn ($v) => $v !== '' && $v !== []));
        }

        return $response;
    }
}
