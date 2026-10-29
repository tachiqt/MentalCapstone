# SmartCare

AI-assisted learning and progress companion for Malvar Assisted Facility and Therapy Center.

## Stack

- **Backend:** Laravel 11 + Sanctum + MySQL/SQLite + OpenAI
- **Web:** Head Doctor & Psychometrician (`backend/public/web` or `/web`)
- **Mobile:** Flutter scaffold (`mobile/`) for Teacher, Caretaker, Parent
- **Tooling:** Spec Kit, UI/UX Pro Max, Impeccable

## Quick start (backend)

```powershell
$env:Path = "C:\xampp\php;C:\Program Files\7-Zip;" + $env:Path
cd backend
# Ensure database/database.sqlite exists (or set MySQL in .env)
php artisan migrate:fresh --seed
php artisan serve
```

Demo logins (password: `password`):

| Username | Role |
|----------|------|
| headdoctor | Head Doctor |
| psycho | Psychometrician |
| teacher | Teacher |
| caretaker | Caretaker |
| parent | Parent |

Sample data includes 4 children, 2 checklists, assessments (pending AI, awaiting review, approved), therapy sessions, medication logs, learning materials, progress records, and parent feedback. Re-seed anytime:

```powershell
php artisan migrate:fresh --seed
```

API base: `http://127.0.0.1:8000/api/v1`  
Web UI: `http://127.0.0.1:8000/web/`

## OpenAI

Set in `backend/.env`:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_FAKE=false
```

Keep `OPENAI_FAKE=true` for local/demo without calling OpenAI. Teachers must still review recommendations.

## Tests

```powershell
cd backend
php artisan test
```

## Design

See `DESIGN.md`, `PRODUCT.md`, and `design-system/smartcare/MASTER.md`.

## Deploy

See [DEPLOY.md](DEPLOY.md).
