<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenAIChecklistService
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
You are a clinical assessment checklist designer for a special-needs therapy facility.
Create observation checklist items for psychometricians to score during evaluations.
Rules:
- Do NOT diagnose medical conditions.
- Do NOT suggest medication.
- Items must be observable behaviors or skills that can be scored.
- Use clear, professional clinical language suitable for Head Doctor review.
- Respond with JSON only using these keys:
  - title (string)
  - description (string)
  - category (string)
  - scoring_guide (string) explaining the score scale
  - items (array of objects with: prompt, domain, scoring_hint)
  - caution (string)
PROMPT;

    /**
     * @param  array{
     *   title?: string|null,
     *   category: string,
     *   age_band?: string|null,
     *   diagnosis_focus?: string|null,
     *   purpose?: string|null,
     *   item_count?: int|null
     * }  $input
     * @return array<string, mixed>
     */
    public function suggest(array $input): array
    {
        $itemCount = max(4, min(16, (int) ($input['item_count'] ?? 8)));

        $payload = [
            'facility' => 'Malvar Assisted Facility',
            'requested_title' => $input['title'] ?? null,
            'category' => $input['category'],
            'age_band' => $input['age_band'] ?? null,
            'diagnosis_focus' => $input['diagnosis_focus'] ?? null,
            'purpose' => $input['purpose'] ?? null,
            'item_count' => $itemCount,
            'score_scale' => '0-3 (0=not observed, 1=emerging, 2=developing, 3=consistent)',
        ];

        $useFake = ! config('openai.key')
            || app()->environment('testing')
            || config('openai.fake');

        $draft = $useFake
            ? $this->fakeDraft($payload)
            : $this->callOpenAI($payload);

        return $this->normalizeDraft($draft, $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function fakeDraft(array $payload): array
    {
        $category = $payload['category'];
        $age = $payload['age_band'] ?? 'general';
        $count = (int) $payload['item_count'];

        $templates = [
            'Motor Skills' => [
                'Maintains sitting balance without support during table activity',
                'Uses pincer grasp to pick up small objects',
                'Copies simple shapes with writing tool',
                'Coordinates both hands during two-step task',
                'Walks across room with stable gait',
                'Stacks blocks to form a tower of at least four',
            ],
            'Social' => [
                'Makes eye contact when greeted by familiar adult',
                'Responds to name consistently within 3 seconds',
                'Initiates shared attention by showing an object',
                'Takes turns during structured play',
                'Uses simple greeting with peer or adult',
                'Seeks help appropriately when stuck',
            ],
            'Cognitive' => [
                'Follows one-step verbal instruction',
                'Matches identical objects or pictures',
                'Completes simple cause-effect toy sequence',
                'Identifies familiar objects by function',
                'Remembers and repeats a two-step routine',
                'Sorts objects by a single attribute',
            ],
            'Behavioral' => [
                'Transitions between activities with minimal prompting',
                'Remains seated for short structured task',
                'Uses calm-down strategy when frustrated',
                'Accepts “no” or delay without escalation',
                'Follows classroom/session safety rules',
                'Completes preferred then non-preferred task sequence',
            ],
        ];

        $pool = $templates[$category] ?? $templates['Cognitive'];
        $items = [];
        for ($i = 0; $i < $count; $i++) {
            $items[] = [
                'prompt' => $pool[$i % count($pool)].($i >= count($pool) ? ' (variation '.($i + 1).')' : ''),
                'domain' => $category,
                'scoring_hint' => 'Score 0–3 based on consistency of observation',
            ];
        }

        return [
            'title' => $payload['requested_title'] ?: "{$category} baseline ({$age})",
            'description' => "Observation checklist for {$category} focused on {$age} developmental context.",
            'category' => $category,
            'scoring_guide' => '0 = not observed, 1 = emerging with support, 2 = developing, 3 = consistent independently',
            'items' => $items,
            'caution' => 'AI draft for Head Doctor review only. Not a diagnosis. Edit before publishing.',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function callOpenAI(array $payload): array
    {
        $response = Http::withToken(config('openai.key'))
            ->timeout(90)
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => config('openai.model'),
                'response_format' => ['type' => 'json_object'],
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
                    ['role' => 'user', 'content' => json_encode($payload)],
                ],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('OpenAI checklist generation failed: '.$response->body());
        }

        $content = $response->json('choices.0.message.content');
        $decoded = json_decode($content ?? '', true);

        if (! is_array($decoded)) {
            throw new RuntimeException('OpenAI returned an invalid checklist draft.');
        }

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $draft
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizeDraft(array $draft, array $payload): array
    {
        $category = $draft['category'] ?? $payload['category'];
        $items = collect($draft['items'] ?? [])
            ->filter(fn ($item) => is_array($item) && filled($item['prompt'] ?? null))
            ->values()
            ->map(function (array $item, int $index) use ($category) {
                return [
                    'prompt' => trim((string) $item['prompt']),
                    'domain' => trim((string) ($item['domain'] ?? $category)) ?: $category,
                    'scoring_hint' => trim((string) ($item['scoring_hint'] ?? 'Score 0–3')),
                    'sort_order' => $index,
                ];
            })
            ->all();

        if ($items === []) {
            $fallback = $this->fakeDraft($payload);
            $items = $fallback['items'];
            $draft = array_merge($fallback, $draft);
        }

        return [
            'title' => trim((string) ($draft['title'] ?? $payload['requested_title'] ?? 'Untitled checklist')),
            'description' => trim((string) ($draft['description'] ?? '')),
            'category' => $category,
            'scoring_guide' => trim((string) ($draft['scoring_guide'] ?? '0–3 observation scale')),
            'items' => $items,
            'caution' => trim((string) ($draft['caution'] ?? 'Human review required before clinical use.')),
            'source' => config('openai.fake') || ! config('openai.key') ? 'template' : 'openai',
        ];
    }
}
