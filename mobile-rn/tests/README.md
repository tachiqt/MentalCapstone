# Mobile API tests

Live tests that call the real SmartCare API using the same request code as the
app (`lib/api.ts`). A passing run means the mobile app can actually reach and
render every screen for every role — not just that the code compiles.

There are three suites:

| Suite | File | Question it answers |
|---|---|---|
| Endpoints | `api-integration.mjs` | Does every endpoint each screen calls work, for every role? |
| Care journeys | `care-journey.mjs` | Do the real multi-role workflows work end to end, including who gets notified? |
| Workflow scenarios | `workflow-scenarios.mjs` | Do the enhanced modules hold up in multi-step situations (therapy date/time, plans, meds inactive, parent feedback response, diagnosis history)? |

The endpoint suite checks the surface one call at a time. The journey suite
walks what people actually do — a teacher sets up medication, the caretaker
administers it, the parent sees the result and replies — and verifies each hop
from the next person's phone. The scenario suite stress-tests the facility
workflow enhancements across edge cases (wrong plan/child, inactive meds,
permission boundaries). Run all three.

The backend has a mirror of the journey suite in
`backend/tests/Feature/CareJourneyTest.php`, which drives the same workflows
against an isolated database and asserts the notification fan-out directly. Run
it with `php artisan test --filter=CareJourneyTest`.

No test framework and no extra dependencies. Plain Node (18+) with built-in
`fetch`.

## Run

```powershell
cd mobile-rn

# Endpoint suite — uses EXPO_PUBLIC_API_URL from .env
npm test
npm run test:local           # local backend
npm run test:prod            # deployed Cloud Run backend

# Care journey suite
npm run test:journey
npm run test:journey:local
npm run test:journey:prod

# Workflow scenario suite (therapy / plans / meds / feedback / diagnosis)
npm run test:scenarios
npm run test:scenarios:local
npm run test:scenarios:prod

# All suites against a local backend
npm run test:all:local

# Any other host
node tests/care-journey.mjs --base http://192.168.1.8:8000/api/v1
```

Base URL resolution order: `--base` flag, then `SMARTCARE_API_URL`, then
`EXPO_PUBLIC_API_URL` from `.env`, then `http://127.0.0.1:8000/api/v1`.
`EXPO_PUBLIC_API_URL` is commented out by default, so bare `npm test` targets the
local backend — use `npm run test:prod` for the deployed API.

## Accounts

Defaults match [TEST_ACCOUNTS.md](../TEST_ACCOUNTS.md) with password
`password`. Override with environment variables:

| Variable | Default |
|---|---|
| `SMARTCARE_TEST_PASSWORD` | `password` |
| `SMARTCARE_TEACHER_USERNAME` | `mobile_teacher` |
| `SMARTCARE_CARETAKER_USERNAME` | `mobile_caretaker` |
| `SMARTCARE_PARENT_USERNAME` | `mobile_parent` |
| `SMARTCARE_HD_USERNAME` | *(unset)* |
| `SMARTCARE_HD_PASSWORD` | *(unset)* |
| `SMARTCARE_PSYCHO_USERNAME` | `psycho` (scenarios) |
| `SMARTCARE_PSYCHO_PASSWORD` | same as `SMARTCARE_TEST_PASSWORD` |

The Head Doctor credentials are optional. Without them the account-creation and
verification-email suite is skipped, and everything else still runs. Diagnosis
scenarios use HD credentials when set, otherwise fall back to the psychometrician
account. Never commit real credentials — pass them per run:

```powershell
$env:SMARTCARE_HD_USERNAME = "markvincent"
$env:SMARTCARE_HD_PASSWORD = "..."
npm run test:prod
```

## Seeding data

Against a local backend, seed accounts and demo data first, otherwise
data-dependent checks report as skipped rather than failed:

```powershell
cd backend
php artisan serve                                        # in one terminal
php artisan db:seed --class=MobileTestAccountsSeeder
php artisan db:seed --class=MobileDemoDataSeeder
```

## What is covered

| Suite | Checks |
|---|---|
| Connectivity | base URL reachable, unauthenticated and malformed-token requests get 401, public `landing-stats` |
| Authentication | bad password, unknown user, validation, login for all three roles, `/me` round-trip |
| Role gating | each account is a `MOBILE_ROLES` value, web-only roles are refused by the app guard, mobile roles refused on the web client, cross-role 403s |
| Teacher screens | `/children`, `/recommendations?status=pending_review`, `/therapy-sessions`, `/learning-materials` (+ detail and file download), `/medication-schedules`, `/medication-logs` |
| Caretaker screens | `/medication-schedules?today=1`, `/medication-logs`, `/children`, recording a dose, invalid status rejected |
| Parent screens | `/children`, `/progress`, `/therapy-sessions`, `/parent-feedback`, `/medication-logs`, child detail endpoints, submitting feedback, unrelated child blocked |
| Notifications | `{ notifications, unread }` shape, mark-read via `PATCH`, `POST` correctly rejected as 405 |
| AI review | approving a pending recommendation, invalid status rejected |
| Head Doctor account creation | `POST /users` returns 201 with `mail_sent: true` and a signed `verification_url`, new account starts unverified, unverified login is 403, the signed link verifies and redirects to `verify-email.html`, login then succeeds, duplicate email is 422 |
| Logout | `POST /logout` invalidates the token |
| Cleanup | deletes users created during the run |

### Care journeys (`care-journey.mjs`)

| Journey | Walkthrough |
|---|---|
| 1. Everyone starts their day | all three roles sign in, `/me` hydrates the session, and a child linked to all three is chosen to coordinate on |
| 2. The daily medication round | teacher creates a schedule → caretaker finds it on Today and is notified → caretaker logs the dose → teacher and parent are notified but the caretaker is not → parent sees the dose history → only caretakers may log → schedule is deactivated |
| 3. Scheduling a therapy session | teacher books a session → parent sees it on Schedule → caretaker is notified → parent cannot book or cancel → session is removed |
| 4. Progress note and the parent reply | teacher records a milestone → parent reads it and is notified → parent replies with feedback (with and without a subject) → teacher sees the feedback |
| 5. Working through the inbox | inbox shape for all roles, `PATCH` read drops the badge by exactly one, `POST` is 405, mark-all-read clears it, one user cannot read another's row |
| 6. The boundaries | every visible child is genuinely linked, a child outside the circle is refused, mobile roles cannot reach Head Doctor endpoints |
| 7. Head Doctor onboarding *(optional)* | creates an account, confirms it cannot sign in until verified, rejects a duplicate email, deletes it |
| 8. Signing off | logout invalidates the token |

## Reading the output

- `✔` passed
- `○` skipped — usually missing seed data or unset Head Doctor credentials. Skips
  are not failures; the reason is printed inline.
- `✖` failed — repeated in the summary with the assertion message.

Exit code is `0` only when nothing failed, so this is safe to use in CI.

## Side effects

Runs against a real database. Medication logs, parent feedback, progress notes,
and AI review approvals are intentionally left in place because those records
are an audit trail the app cannot delete. What the journey suite can undo, it
does: the therapy session it books is deleted and the medication schedule it
creates is deactivated, both in a final step of their journey. Test users
created by the Head Doctor journey are deleted too. Prefer a local or staging
database when possible.

The backend `CareJourneyTest` has no such caveat — it uses `RefreshDatabase`, so
it builds its own facility and leaves nothing behind.
