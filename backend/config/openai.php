<?php

return [
    'key' => env('OPENAI_API_KEY'),
    'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
    'fake' => filter_var(env('OPENAI_FAKE', true), FILTER_VALIDATE_BOOLEAN),
];
