<?php

use Illuminate\Support\Facades\Route;

/*
| SmartCare web UI is served as static files from public/web/.
| Open http://127.0.0.1:8000/web/ after `php artisan serve`.
| API base resolves to same-origin /api/v1 when hosted there.
*/

Route::get('/', function () {
    return response(
        'SmartCare API is running. Open the web dashboard at /web/ (e.g. http://127.0.0.1:8000/web/).',
        200,
        ['Content-Type' => 'text/plain']
    );
});
