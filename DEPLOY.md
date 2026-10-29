# Deploy SmartCare on Google Cloud

## Live URLs

- App / API: https://smartcare-zdi2psmkca-as.a.run.app
- Web dashboard: https://smartcare-zdi2psmkca-as.a.run.app/web/
- Static assets (GCS): https://storage.googleapis.com/agile-team-509312-u8-smartcare/smartcare/assets/web/

## Architecture

```
Web / mobile → HTTPS → Cloud Run (Laravel + /web dashboard)
                         → Cloud SQL MySQL (smartcare-mysql)
                         → Cloud Storage (uploads + static media)
                         → Secret Manager
                         → OpenAI API
```

## Project

- GCP project: `agile-team-509312-u8` (Mark — migrated from Rachel edge `project-0c52cd6b-9a55-42dd-a1c`)
- Region: `asia-southeast1`
- Cloud Run: `smartcare`
- Cloud SQL: `smartcare-mysql` / database `smartcare`
- GCS bucket: `agile-team-509312-u8-smartcare`

## Head Doctor login

- Email: `smartcare102030@gmail.com`
- Username: `markvincent`
- Temporary password: `Smartcare123`
- Change password in **Settings** after first login.

## Accounts

There is no self-signup. Every account is created by the Head Doctor in the web
dashboard under **Staff → Create account** (`POST /api/v1/users`), which emails a
signed verification link to the new user. Unverified accounts are refused at
login until they open that link.

## Email verification

Production mail uses Gmail SMTP (`MAIL_MAILER=smtp`, secrets `smartcare-mail-username` / `smartcare-mail-password` / from address). Current mailbox: `smartcare102030@gmail.com`.
Verification links are signed against `APP_URL` and open `/web/verify-email.html`.

## Google Sign-In

1. Open [OAuth clients](https://console.cloud.google.com/apis/credentials?project=agile-team-509312-u8).
2. Edit the Web client (or create **SmartCare Web**):
   - **Authorized JavaScript origins**
     - `https://smartcare-zdi2psmkca-as.a.run.app`
     - `http://localhost`
     - `http://127.0.0.1`
   - **Authorized redirect URIs** (mobile / Expo)
     - `https://smartcare-zdi2psmkca-as.a.run.app`
     - `https://auth.expo.io/@your-expo-username/smartcare-mobile`
3. Store the client ID in Secret Manager as `smartcare-google-client-id` (Cloud Run reads `GOOGLE_CLIENT_ID`).
4. Mobile: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the same Web client ID.

Web login loads Google Identity Services from `/api/v1/app-config` (`google_client_id`).  
Backend verifies the Google ID token audience, requires an existing SmartCare user, and marks email verified when Google reports `email_verified`.

## Redeploy

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG=v3 .
```

## PHP runtime security

Cloud Run builds from `backend/Dockerfile`, pinned to **PHP 8.2.35** (`php:8.2.35-apache-bookworm`) for the 21 Oct 2026 security release:

- [CVE-2026-109618](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w) — RCE via OOM memory corruption  
- [CVE-2026-109619](https://www.kb.cert.org/vuls/id/763488) — RCE via stale global state / use-after-free  

Local XAMPP/CLI must be upgraded separately to **8.2.35+** (or a patched 8.3/8.4/8.5). PHP 8.2 reaches EOL on 31 Dec 2026.

## Uploads & assets

- Avatars and learning materials use the `gcs` disk (`MEDIA_DISK` / `AVATARS_DISK`).
- Web media is on GCS under `smartcare/assets/web/`.
- `ASSETS_URL` points the dashboard at GCS for banners/avatars/landing photos.
- Sync command: `php artisan smartcare:sync-web-assets`

## Local development

Leave GCS bucket unset so uploads fall back to the local `public` disk. Leave `ASSETS_URL` empty to use `/web/assets/...`.

## Mobile

`mobile-rn/lib/config.ts` resolves the API base URL in this order:

1. `EXPO_PUBLIC_API_URL` when set — `.env` ships pointed at Cloud Run
2. In development, the Metro LAN host, or `http://10.0.2.2:8000/api/v1` on the Android emulator
3. In production builds, `https://smartcare-zdi2psmkca-as.a.run.app/api/v1`

Because `.env` sets the variable, both dev and release builds read the same Cloud
SQL data and Cloud Storage media as the web dashboard. Point it at
`http://10.0.2.2:8000/api/v1` to work against a local backend; Metro must be
restarted for a change to take effect.

### Media and assets

Uploaded media (avatars, learning material files) arrives as absolute public
`storage.googleapis.com` URLs from the `avatar_url` and `file_url` accessors, so
mobile loads it directly with no proxying. `resolveMediaUrl` in
`mobile-rn/lib/config.ts` passes those through untouched and refuses bare storage
object keys, which have no host it could infer.

Static assets work like the web: `mobile-rn/lib/app-config.ts` fetches
`/app-config` at boot and caches `assets_url`, mirroring `js/dashboard/boot.js`.

Two prerequisites on the bucket, both configured out of band rather than in this
repo: the Cloud Run service account needs `roles/storage.objectAdmin`, and
`allUsers` needs `roles/storage.objectViewer` so clients can read the URLs.

### Seeding cloud data

The `smartcare-seed` Cloud Run job runs `php artisan db:seed --force` on the
deployed image with the live service's environment and Cloud SQL socket:

```bash
gcloud run jobs execute smartcare-seed --region=asia-southeast1 --wait
```

Seeders are idempotent. This is what creates the `mobile_teacher`,
`mobile_caretaker`, and `mobile_parent` accounts plus their demo children,
therapy sessions, medication schedules, progress, and feedback.

Verify a deployment end to end with the live API tests:

```bash
cd mobile-rn
npm run test:prod
```

See [mobile-rn/tests/README.md](mobile-rn/tests/README.md) for the accounts and
environment variables it uses.
