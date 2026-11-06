# SmartCare System Turnover Guide

**System:** SmartCare  
**Organization:** Malvar Assisted Facility and Therapy Center  
**Turnover baseline:** November 6, 2026  
**Audience:** Incoming developers, system administrators, testers, and facility owners

## 1. Purpose and scope

SmartCare is a role-based care-management system for recording and coordinating a child's care across facility staff and parents. It provides:

- a browser dashboard for the Head Doctor and Psychometrician;
- an Android-focused mobile application for Teachers, Caretakers, and Parents; and
- a shared Laravel API, database, notification layer, file-storage layer, and integration layer used by both clients.

The system is not an autonomous clinical decision-maker. AI output is a recommendation that must be reviewed by authorized staff before it becomes an operational therapy plan.

## 2. Users and primary functions

| Role | Client | Main responsibilities |
|---|---|---|
| Head Doctor | Web | Manage accounts and workspace settings; manage children and assignments; maintain checklists, learning materials, medications, and therapy plans; review AI recommendations; view facility, child, and medication reports; inspect activity logs. |
| Psychometrician | Web | Manage child profiles, status, diagnosis history, documents, and galleries; maintain assessment checklists; submit assessments; generate AI recommendations; view assessment-oriented reports. |
| Teacher | Mobile | View assigned children and assessments; generate and review AI recommendations; create therapy plans; schedule, update, complete, or cancel therapy sessions; maintain medication schedules and learning-material assignments; submit progress records and photos; respond to parent feedback. |
| Caretaker | Mobile | View assigned children and daily medication work; record administered medication; add child progress updates; receive relevant notifications. |
| Parent | Mobile | View linked child information, schedules, medication history, progress, and protected progress photos; submit feedback; receive relevant notifications. |

Access is enforced by backend role middleware and child-assignment checks. Hiding a screen or button in a client is not the security boundary.

### Major functional modules

1. **Authentication and account lifecycle**
   - The Head Doctor creates accounts; public self-registration is not available.
   - New accounts must verify their email before login.
   - Username/password and Google Sign-In are supported.
   - Google Sign-In authenticates an existing SmartCare account; it does not create one.
   - Laravel Sanctum bearer tokens protect authenticated API requests.
   - Web login is restricted to Head Doctor and Psychometrician accounts. Mobile login is restricted to Teacher, Caretaker, and Parent accounts.
   - Users can update their profile, password, and preferences and can invalidate other sessions.

2. **Child records and care-team assignment**
   - Stores child profiles, diagnosis history, status history, documents, and assigned Teacher, Caretaker, and Parent relationships.
   - Supports active/inactive lifecycle, soft deletion, restoration, and batch assignment.
   - Assigned mobile users only see children within their care relationship.

3. **Assessments, checklists, and AI recommendations**
   - Authorized web users maintain assessment checklists and submit assessments.
   - The backend can generate checklist suggestions and child-specific recommendations through OpenAI.
   - A Teacher or Head Doctor reviews, modifies, approves, or rejects a recommendation.
   - An approved recommendation can create the operational therapy plan and selected learning-material assignments.

4. **Therapy management**
   - Stores therapy plans and individual therapy sessions.
   - Teachers can request schedule suggestions that consider operating hours, preferred times, and teacher conflicts.
   - Sessions support scheduled, completed, cancelled, and deleted workflows, including outcomes and notes.

5. **Medication management**
   - Teachers and the Head Doctor maintain medication schedules, including multiple daily times and active/inactive state.
   - Only Caretakers record administered doses.
   - Authorized users can view medication logs; the Head Doctor has weekly/monthly reporting.

6. **Progress, gallery, and documents**
   - Staff can record progress notes and attach protected progress photos.
   - Authorized web roles manage child documents, child galleries, and custom facility albums.
   - Sensitive files are returned through authenticated API endpoints rather than public object URLs.

7. **Learning materials**
   - Maintains a reusable material library and child-to-material assignments.
   - Assignment avoids duplicating the canonical library record.

8. **Feedback, notifications, search, and reporting**
   - Parents send child-related feedback; staff acknowledge and respond.
   - Important actions fan out notifications only to relevant users.
   - Users can mark individual or all notifications as read.
   - Search and report contents vary by role.
   - Reports include facility summaries, psychometrician summaries, child reports, and medication summaries.

## 3. Technical architecture

```text
Web dashboard (static HTML/CSS/JavaScript) ----\
                                                > Laravel JSON API ---- Cloud SQL (MySQL)
Expo / React Native mobile application --------/          |
                                                           +---- Public Cloud Storage
                                                           +---- Private Cloud Storage
                                                           +---- OpenAI API
                                                           +---- Resend email
                                                           +---- Google Identity
```

All business data and authorization decisions are centralized in the Laravel backend. The clients call versioned endpoints under `/api/v1`.

### Technology stack

| Layer | Technology |
|---|---|
| Backend | PHP 8.2.35+, Laravel 11, Laravel Sanctum 4, Eloquent ORM |
| Backend testing | PHPUnit 11, Laravel feature-test utilities, SQLite in-memory test database |
| Web dashboard | Static HTML5, CSS, and modular vanilla JavaScript; Fetch API and browser local storage |
| Backend asset tooling | Vite 6, Tailwind CSS 3, PostCSS, Autoprefixer |
| Mobile | Expo 57, React Native 0.86, React 19, TypeScript 6, Expo Router |
| Mobile data/state | TanStack React Query, Fetch API, Expo Secure Store |
| Production database | Google Cloud SQL for MySQL |
| Local database | SQLite by default; MySQL is optional |
| Files | Laravel filesystem abstraction with local storage or Google Cloud Storage |
| Container/runtime | Docker, Apache, PHP, Google Cloud Run |
| Build and registry | Google Cloud Build and Artifact Registry |
| Mobile builds | Expo Application Services (EAS); APK for preview and AAB for production |
| External services | OpenAI, Google Sign-In, Resend email |

## 4. Repository ownership map

| Location | Responsibility |
|---|---|
| `backend/app/Http/Controllers/Api/` | API request validation, authorization-aware orchestration, and responses |
| `backend/app/Models/` | Eloquent data models and relationships |
| `backend/app/Services/` | Canonical media, avatar, notification, OpenAI, and schedule-suggestion behavior |
| `backend/routes/api.php` | Versioned API surface and role middleware |
| `backend/database/migrations/` | Database schema history |
| `backend/database/seeders/` | Demonstration/local data |
| `backend/tests/` | PHPUnit unit and feature/regression tests |
| `backend/public/web/` | Web files that are actually included in the production Docker image |
| `web/` | Root web working/source copy |
| `mobile-rn/app/` | Expo Router screens and role-specific navigation |
| `mobile-rn/components/` | Reusable mobile UI and role components |
| `mobile-rn/lib/` | API client, authentication, configuration, navigation, queries, and domain helpers |
| `mobile-rn/tests/` | Live API endpoint and multi-role workflow suites |
| `cloudbuild.yaml` | Production container build, push, and Cloud Run deployment definition |
| `backend/Dockerfile` | Production PHP/Apache image |
| `backend/docker/entrypoint.sh` | Container startup migration, account check, asset upload, caching, and Apache startup |
| `mobile-rn/eas.json` | Development, preview APK, and production AAB build profiles |
| `README.md` | Full local setup and production command guide |
| `DEPLOY.md` | Short production deployment card |
| `docs/manual/` | End-user manual source and generated document |

### Web-copy release rule

The Cloud Build Docker context is `backend/`, so production serves `backend/public/web/`, not the root `web/` directory. The two trees currently contain equivalent content apart from line-ending differences, but the repository has no command that synchronizes them. The `smartcare:sync-web-assets` command uploads assets from `backend/public/web/assets` to Cloud Storage; it does not copy the root web tree.

When changing the web dashboard, update and compare both trees before deployment. Long term, select one canonical source and add a deterministic sync/build command to prevent drift.

## 5. Data, storage, and integrations

### Database

Laravel migrations are the schema source of truth. Production uses the `smartcare` database in Cloud SQL; local development and automated backend tests can use SQLite. Core records include users, children, assignments, assessments and responses, recommendations, therapy plans/sessions, medication schedules/logs, progress records/photos, learning materials, feedback, notifications, activity logs, documents, gallery albums/photos, histories, and workspace settings.

Never run `php artisan migrate:fresh` against production. It drops existing tables and data.

### File classification

| Classification | Examples | Production location | Access model |
|---|---|---|---|
| Public | Web assets, approved avatars, learning materials intended for sharing | Public GCS bucket | Public URL where configured |
| Private | Child documents, progress photos, gallery photos | Private GCS bucket | Authenticated API endpoint plus role/assignment authorization |

Do not move sensitive child media to the public bucket for convenience. Local private files are stored under Laravel's private storage path.

### OpenAI

`OpenAIRecommendationService` and `OpenAIChecklistService` are the canonical integration points. `OPENAI_FAKE=true` provides deterministic local/test behavior and avoids charges. Production sets it to `false` and obtains the API key from Secret Manager. Staff review remains mandatory.

### Email and identity

- Local email can use Laravel's log mailer.
- Production verification mail uses Resend and requires a verified sending domain/address.
- Google Sign-In client identifiers must agree across the backend, web origin configuration, and EAS mobile profiles.

## 6. Configuration and secrets

Local settings belong in `backend/.env` and `mobile-rn/.env`; use the checked-in example files as templates. Production secrets are referenced from Google Secret Manager by `cloudbuild.yaml`.

Required production secret categories are:

- Laravel application key;
- Cloud SQL password;
- OpenAI API key;
- Google OAuth web client ID;
- Resend API key; and
- verified mail-from address.

Never commit environment files, passwords, tokens, service-account JSON, database exports, or migration credentials. Rotate any credential exposed in chat, email, screenshots, logs, or source control.

### Immediate repository hygiene item

At turnover, an untracked `migration_transfer/` directory is present and contains filenames indicating credentials. Its contents were not inspected. The current `.gitignore` ignores `migration-transfer/` with a hyphen, which does not cover `migration_transfer/` with an underscore. Treat the directory as sensitive: confirm whether the transfer is complete, move or securely remove it under the owner's retention policy, rotate transferred credentials if exposure is possible, and correct the ignore rule before any broad `git add` operation.

## 7. Local development

### Backend and web

Prerequisites: PHP 8.2.35+, Composer 2, and optionally MySQL.

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
New-Item -ItemType File database\database.sqlite -Force
php artisan migrate:fresh --seed
php artisan storage:link
php artisan serve
```

Configure the local `.env` before migration. Recommended development values use SQLite, file-backed sessions/cache, synchronous queues, log email, local private storage, and fake OpenAI responses. The web dashboard is available at `http://127.0.0.1:8000/web/` and the API at `http://127.0.0.1:8000/api/v1`.

For a physical phone, start Laravel with `--host=0.0.0.0`, use the computer's LAN address in the mobile environment, keep both devices on the same network, and allow the chosen port through the firewall.

### Mobile

Prerequisites: Node.js 18+, npm, and an Android emulator/device.

```powershell
cd mobile-rn
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `mobile-rn/.env`. Android Emulator uses `http://10.0.2.2:8000/api/v1`; a physical device uses the development computer's LAN address. Restart Metro after environment changes.

## 8. Testing and release validation

### Backend automated tests

The PHPUnit feature suite covers authentication, email verification, role authorization, child lifecycle and assignments, diagnosis history, documents and galleries, assessments and AI review, therapy plans/sessions, medications, progress photos, learning materials, parent feedback, notifications, reports, workspace behavior, and multi-role care journeys.

Tests use an in-memory SQLite database, fake OpenAI behavior, array mail/session/cache, and synchronous queues, so they do not modify the local or production database.

```powershell
cd backend
composer install
php artisan test
```

Useful targeted runs include:

```powershell
php artisan test --filter=CareJourneyTest
php artisan test --filter=RoleOperationalSustainabilityTest
php artisan test --filter=PsychometricianRbacTest
```

### Mobile validation

Type-check the application:

```powershell
cd mobile-rn
npx tsc --noEmit
```

The plain-Node live API suites validate individual endpoints, real multi-role care journeys, notifications, and workflow edge cases. They require a running, seeded API and dedicated test accounts.

```powershell
npm run test:all:local
npm run test:prod
npm run test:journey:prod
npm run test:scenarios:prod
```

Production tests mutate data. Use designated test accounts and coordinate the run; never place live credentials in source files or command history that will be shared.

### Minimum release gate

Before deploying:

1. Review `git status` and the intended diff; exclude secrets and unrelated files.
2. Confirm both web copies are synchronized.
3. Run the complete backend test suite.
4. Run mobile TypeScript checking.
5. Run local mobile API/workflow suites when API behavior changed.
6. Confirm migrations are forward-safe and do not destroy existing data.
7. Confirm production configuration and required Secret Manager versions exist.
8. Deploy a unique immutable image tag.
9. Check the health endpoint, web login, relevant role workflows, logs, and protected-file access.

### Verification performed for this turnover document

- Mobile TypeScript validation completed successfully with `npx tsc --noEmit` on November 6, 2026.
- Web trees were compared and matched when end-of-line differences were ignored.
- The backend suite could not be executed in this checkout because `backend/vendor/` was absent. Run `composer install` and then `php artisan test` before the next release.

## 9. Production deployment

### Current Google Cloud topology

| Resource | Current value |
|---|---|
| Project | `agile-team-509312-u8` |
| Region | `asia-southeast1` |
| Cloud Run service | `smartcare` |
| Cloud SQL instance | `smartcare-mysql` |
| Artifact Registry repository | `smartcare` |
| Public bucket | `<project>-smartcare` |
| Private bucket | `<project>-smartcare-private` |

The current service/API host and exact operator commands are maintained in `README.md` and `DEPLOY.md`.

### Backend deployment flow

From the repository root:

```powershell
gcloud auth login
gcloud config set project agile-team-509312-u8
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG=<new-release-tag> --project=agile-team-509312-u8
```

Cloud Build builds `backend/Dockerfile`, pushes the image, and deploys Cloud Run with 1 CPU, 1 GiB memory, zero to five instances, Cloud SQL connectivity, environment variables, and Secret Manager references.

At container startup, the entrypoint:

1. binds Apache to Cloud Run's port;
2. runs `php artisan migrate --force`;
3. ensures the Head Doctor account exists;
4. attempts to upload web assets to GCS;
5. caches Laravel configuration and routes; and
6. starts Apache.

The Head Doctor check and asset synchronization are best-effort operations, but migration failure stops container startup. Review Cloud Run logs after every revision.

### Mobile build flow

```powershell
cd mobile-rn
npx eas-cli build --platform android --profile preview --non-interactive
npx eas-cli build --platform android --profile production --non-interactive
```

The preview profile produces an internally distributed APK. The production profile produces an Android App Bundle and increments the application version. Verify the API URL and Google client ID in the selected profile before building.

### Health check and rollback

After deployment, expect HTTP 200 from `/api/v1/app-config`, open the web login, perform a representative authenticated workflow, and inspect Cloud Run error logs.

Rollback is not automated in `cloudbuild.yaml`. Keep unique image tags and use Cloud Run revision traffic management or redeploy a known-good image. A rollback of application code does not automatically reverse database migrations; every migration must therefore be backward-conscious, and any schema rollback requires a separately reviewed recovery plan.

## 10. Operations and maintenance

### Routine checks

- Review Cloud Run errors, failed mail, OpenAI failures, authorization failures, and slow requests.
- Monitor Cloud SQL capacity, connections, storage, backups, and restore readiness.
- Monitor public/private bucket permissions and storage growth.
- Review Artifact Registry image retention and Cloud Build failures.
- Confirm verification email delivery after Resend or DNS changes.
- Confirm Google Sign-In after OAuth-origin, signing-certificate, or EAS changes.
- Regularly update PHP, Composer, npm, Expo, and Laravel dependencies with tests and release notes.
- Periodically verify that the private bucket has no public access.

### Backup and recovery ownership

Backup creation and restore automation are not defined in this repository. The system owner must confirm Cloud SQL automated backups, point-in-time recovery, retention, and a tested restoration procedure in Google Cloud. Decide and document retention for child records and uploaded media. Database and GCS recovery procedures should be tested together because database rows reference stored objects.

### Logging and queues

Production sends application logs to standard error for Cloud Logging. Avoid logging passwords, tokens, private document contents, or child medical details. Queue processing is configured as synchronous in the current deployment, so email and related work happen during the request and affect response latency.

### Scaling considerations

Cloud Run can scale to five instances and down to zero. Application state must remain in Cloud SQL, configured storage, or other shared services; do not rely on the container filesystem for persistent production data. Startup migrations may execute concurrently when new instances/revisions start, so future high-traffic growth should move migrations into a controlled release step or job.

## 11. Security and privacy responsibilities

- Apply least privilege to GCP IAM, Cloud SQL, buckets, Secret Manager, Expo, Resend, Google OAuth, and OpenAI accounts.
- Require individual operator accounts and multi-factor authentication; do not share owner credentials.
- Keep public and private storage classifications intact.
- Preserve backend role and assignment checks when adding endpoints.
- Validate file type, count, size, and ownership at upload/download boundaries.
- Keep `APP_DEBUG=false` in production.
- Rotate secrets periodically and immediately after suspected exposure.
- Review activity logs for sensitive administrative actions.
- Establish organization-approved consent, privacy, retention, breach-response, and account offboarding procedures for children's health-related information.
- Have qualified clinical staff validate any workflow or wording that could influence care decisions.

## 12. Known constraints and recommended follow-up

1. **Two web copies:** Establish a single canonical web source or add an automated synchronization/build check.
2. **Untracked credential-transfer directory:** Resolve the `migration_transfer/` hygiene issue before staging repository-wide changes.
3. **Migrations during web startup:** Move production migrations to a controlled deployment job as operational scale increases.
4. **Synchronous queue:** Consider a managed asynchronous worker if email or integration latency becomes material.
5. **No deployment rollback automation:** Document and rehearse Cloud Run revision rollback and database recovery.
6. **No backup policy in code:** Record backup owners, frequency, retention, restoration objectives, and test evidence in the operations runbook.
7. **Mobile test suites use live APIs:** Keep isolated test accounts/data and clearly distinguish smoke tests from destructive workflow tests.
8. **Generated user manual:** Regenerate and review the document under `docs/manual/` whenever user-facing workflows materially change.

## 13. Turnover checklist

The outgoing and incoming owners should jointly confirm:

- repository and branch access;
- GCP project, billing, IAM, Cloud Run, Cloud Build, Artifact Registry, Cloud SQL, GCS, Logging, and Secret Manager access;
- Expo/EAS project access and Android signing/release ownership;
- Resend account/domain access;
- Google OAuth project and authorized origins/signing configuration;
- OpenAI project, billing limits, and key rotation ownership;
- production Head Doctor ownership without exchanging passwords in this document;
- environment-variable and secret inventory;
- backup status and a witnessed restore exercise;
- current production revision/image tag and last successful release date;
- open defects, planned changes, and data-migration status;
- full automated test result and representative role-based acceptance tests; and
- incident contacts, escalation path, privacy responsibilities, and credential offboarding.

For command-level setup and current endpoints, use `README.md`. For the shortened production procedure, use `DEPLOY.md`. This guide explains ownership and system behavior; those files remain the operational command references.
