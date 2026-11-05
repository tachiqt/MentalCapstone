# SmartCare — Setup & Run Guide

SmartCare is the care system for **Malvar Assisted Facility and Therapy Center**.

It helps staff track therapy, assessments, medication, progress photos, the gallery, and parent feedback.

---

## What you will set up

SmartCare has **three parts**:

| Part | Who uses it | Where it lives |
|------|-------------|----------------|
| **Backend API** | Everything talks to this | `backend/` (Laravel) |
| **Web dashboard** | Head Doctor & Psychometrician | Browser → `/web` |
| **Mobile app** | Teacher, Caretaker & Parent | `mobile-rn/` (Expo / Android) |

**Important:** Nobody can self-register.  
The Head Doctor creates accounts in the web dashboard (**Staff → Create account**).  
New users must open the **email verification link** before they can log in.

---

## Pick your path

| I want to… | Go to |
|------------|--------|
| Run everything on my PC for development | [A. Run locally (backend + web)](#a-run-locally-backend--web) then [B. Run the mobile app](#b-run-the-mobile-app) |
| Build an Android APK for phones | [B4. Build an Android APK](#b4-build-an-android-apk-eas) |
| Deploy / update the live Google Cloud system | [C. Production on Google Cloud](#c-production-on-google-cloud) |
| Understand photo storage, login, AI, accounts, tests | [Reference sections](#reference) at the bottom |

---

## Before you start (software to install)

### For local backend + web

1. **PHP 8.2.35 or newer**  
   - Easy option on Windows: [XAMPP](https://www.apachefriends.org/)  
   - Check version:
     ```powershell
     php -v
     ```
2. **Composer 2** (PHP package manager)  
   - Check: `composer -V`
3. **Optional MySQL**  
   - Not required for the simplest local setup (SQLite is fine).

### For mobile

1. **Node.js 18 or newer**  
   - Check: `node -v`
2. An **Expo account** (free) if you will build APKs with EAS  
3. An Android phone or emulator (optional for day-to-day coding)

### For production deploy

1. **Google Cloud SDK (`gcloud`)** installed and logged in  
2. Access to GCP project **`agile-team-509312-u8`**

> Tip (Windows / XAMPP): if `php` is not found, add it to PATH for that terminal:
> ```powershell
> $env:Path = "C:\xampp\php;C:\Program Files\7-Zip;" + $env:Path
> ```

---

# A. Run locally (backend + web)

Follow these steps **in order** the first time.  
Later days you usually only need steps **A5** and open the browser.

## A1. Open the backend folder

From a terminal, go into the project you cloned, then into `backend`:

```powershell
cd path\to\MentalCapstone\backend
```

Example if the repo is on your Desktop:

```powershell
cd $HOME\Desktop\MentalCapstone\backend
```

On macOS / Linux:

```bash
cd ~/path/to/MentalCapstone/backend
```

## A2. Install PHP packages

```powershell
composer install
```

**What this does:** downloads Laravel and other backend libraries into `vendor/`.

**Success looks like:** the command finishes without red errors, and a `vendor` folder exists.

## A3. Create your local config file

```powershell
copy .env.example .env
php artisan key:generate
```

**What this does:**

- `.env` holds your local settings (database, mail, AI, etc.)
- `key:generate` creates `APP_KEY` (required for encryption / sessions)

**Do not commit `.env` to git.** It can contain secrets.

## A4. Edit `backend/.env` for local use

Open `backend/.env` in an editor and make sure these values are set.

### Recommended simple setup (SQLite — no MySQL needed)

```env
APP_NAME=SmartCare
APP_ENV=local
APP_DEBUG=true
APP_URL=http://127.0.0.1:8000

DB_CONNECTION=sqlite

SESSION_DRIVER=file
CACHE_STORE=file
QUEUE_CONNECTION=sync
FILESYSTEM_DISK=local

# Local file storage (leave GCS buckets empty)
MEDIA_DISK=gcs
AVATARS_DISK=gcs
PRIVATE_MEDIA_DISK=local
GOOGLE_CLOUD_STORAGE_BUCKET=
GOOGLE_CLOUD_PRIVATE_STORAGE_BUCKET=
ASSETS_URL=

# Write emails to the log file instead of sending real email
MAIL_MAILER=log

GOOGLE_CLIENT_ID=

# Fake AI responses locally (no OpenAI charges)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_FAKE=true
```

Then create the SQLite database file:

```powershell
New-Item -ItemType File database\database.sqlite -Force
```

### Optional: use MySQL instead

1. Create an empty database named `smartcare` in MySQL / phpMyAdmin.  
2. In `.env` set:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=smartcare
DB_USERNAME=root
DB_PASSWORD=
```

## A5. Create tables and sample data

```powershell
php artisan migrate:fresh --seed
php artisan storage:link
```

**What this does:**

| Command | Meaning |
|---------|---------|
| `migrate:fresh` | Deletes old tables and recreates them from migrations |
| `--seed` | Fills demo users, children, therapy, meds, etc. |
| `storage:link` | Lets the browser load uploaded files via `/storage/...` |

> Warning: `migrate:fresh` **wipes** the local database. That is fine for development. **Never** run this against production Cloud SQL.

**Success looks like:** seeders finish, and you see no fatal errors.

## A6. Start the server

```powershell
php artisan serve
```

Leave this terminal open while you work.

### Open these in your browser

| What | URL |
|------|-----|
| Login page | http://127.0.0.1:8000/web/login.html |
| Dashboard (after login) | http://127.0.0.1:8000/web/ |
| API root | http://127.0.0.1:8000/api/v1 |

### Try a first login (local demo)

| Username | Password | Use in |
|----------|----------|--------|
| `headdoctor` | `password` | Web |
| `psycho` | `password` | Web |

**Success looks like:** the login page loads and you can enter the dashboard.

## A7. If a phone on Wi‑Fi must reach your PC

By default `php artisan serve` only listens on your PC. For a real phone:

```powershell
php artisan serve --host=0.0.0.0 --port=8000
```

Then:

1. Find your PC’s LAN IP (example: `192.168.1.10`).  
2. Point the mobile app at `http://192.168.1.10:8000/api/v1`.  
3. Allow port **8000** in Windows Firewall if Windows blocks it.  
4. Keep phone and PC on the **same Wi‑Fi**.

---

# B. Run the mobile app

The mobile app is in `mobile-rn/`.  
It is for **Teacher / Caretaker / Parent only**.  
Head Doctor and Psychometrician accounts are blocked on mobile on purpose.

## B1. Install JavaScript packages

Open a **new** terminal (keep the backend server running if you are testing locally):

```powershell
cd path\to\MentalCapstone\mobile-rn
npm install
```

**Success looks like:** `node_modules` is created and the command exits without errors.

## B2. Create `mobile-rn/.env`

Create a file named `.env` inside `mobile-rn/` (same folder as `package.json`).

### Option 1 — talk to your local backend (Android emulator)

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

> `10.0.2.2` is the special Android emulator address for your PC’s `localhost`.

### Option 2 — talk to your local backend (physical phone)

Replace with **your PC’s LAN IP**:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api/v1
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

### Option 3 — talk to the live production server

```env
EXPO_PUBLIC_API_URL=https://smartcare-zdi2psmkca-as.a.run.app/api/v1
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

**Notes:**

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must match the backend `GOOGLE_CLIENT_ID` (same Google **Web** OAuth client).  
- After any `.env` change, **restart** the Expo / Metro process.  
- Do not commit secrets in `.env`.

If you leave `EXPO_PUBLIC_API_URL` empty in development, the app tries to guess a local API host automatically. Setting it explicitly is clearer and more reliable.

## B3. Start Expo (development)

```powershell
cd mobile-rn
npx expo start
```

Then:

1. Press `a` for Android emulator, **or**  
2. Scan the QR code with a development build / Expo Go (depending on your setup).

### Demo mobile logins (after local seed)

| Username | Password | Role |
|----------|----------|------|
| `mobile_teacher` | `password` | Teacher |
| `mobile_caretaker` | `password` | Caretaker |
| `mobile_parent` | `password` | Parent |

**Success looks like:** you can sign in and see home / children / schedule screens without a network error.

## B4. Build an Android APK (EAS)

Use this when you want an installable APK (for real phones) without running Metro.

### First time only

```powershell
cd mobile-rn
npx eas-cli login
```

Sign in with your Expo account in the browser when asked.

### Build the preview APK

```powershell
cd mobile-rn
npx eas-cli build --platform android --profile preview --non-interactive
```

**What this does:** Expo’s cloud builders compile the Android app.  
This usually takes about **10–15 minutes**.

The `preview` profile in `eas.json` is already pointed at the **production API**.

### When the build finishes

1. Open the Expo build page link printed in the terminal.  
2. Download the `.apk`.  
3. Copy it to the phone and install it, **or** install with adb:

```powershell
adb install -r path\to\smartcare-preview.apk
```

**Success looks like:** SmartCare appears on the phone and can log in against the API you configured.

---

# C. Production on Google Cloud

This section is for the **live** system (not your laptop database).

## Live links (current project)

| What | URL |
|------|-----|
| Website / API host | https://smartcare-zdi2psmkca-as.a.run.app |
| Web dashboard | https://smartcare-zdi2psmkca-as.a.run.app/web/ |
| API base | https://smartcare-zdi2psmkca-as.a.run.app/api/v1 |
| Public static assets | https://storage.googleapis.com/agile-team-509312-u8-smartcare/smartcare/assets/web/ |

## Production map (names you will see in GCP)

| Resource | Name / value |
|----------|----------------|
| GCP project | `agile-team-509312-u8` |
| Region | `asia-southeast1` |
| Cloud Run service | `smartcare` |
| Database (Cloud SQL) | instance `smartcare-mysql`, database `smartcare` |
| Public file bucket | `agile-team-509312-u8-smartcare` |
| Private file bucket | `agile-team-509312-u8-smartcare-private` |

## C1. Log in to Google Cloud on your PC

```powershell
gcloud auth login
gcloud config set project agile-team-509312-u8
```

**Success looks like:** `gcloud config get-value project` prints `agile-team-509312-u8`.

## C2. One-time cloud setup (only for a brand-new project)

If this GCP project is **already running SmartCare**, skip to [C3](#c3-update-a-secret-example-openai-key).

For a new project, create these first:

1. Enable APIs: Cloud Run, Cloud Build, Artifact Registry, Cloud SQL Admin, Secret Manager, Cloud Storage.  
2. Create Artifact Registry Docker repo named `smartcare`.  
3. Create Cloud SQL MySQL (`smartcare-mysql`) with database/user `smartcare`.  
4. Create two Storage buckets:
   - **Public** `{project}-smartcare` — Cloud Run can write; browsers can read public objects.  
   - **Private** `{project}-smartcare-private` — Cloud Run only; **no** public access.  
5. Create Secret Manager secrets (see list below).  
6. Give the Cloud Run service account permission to use Cloud SQL, Storage, and those secrets.  
7. (Optional) Create Cloud Run job `smartcare-seed` using the same image/env as the service.

### Secrets the deploy expects

| Secret name in GCP | Used as |
|--------------------|---------|
| `smartcare-app-key` | Laravel `APP_KEY` |
| `smartcare-db-password` | Database password |
| `smartcare-openai-key` | OpenAI API key |
| `smartcare-google-client-id` | Google Sign-In client ID |
| `smartcare-resend-key` | Resend API key (`re_…`) for `RESEND_KEY` |
| `smartcare-mail-from` | Verified Resend from-address (e.g. `noreply@yourdomain.com`) |

## C3. Update a secret (example: OpenAI key)

1. Put the key alone in a text file (no extra spaces or blank lines).  
2. Run:

```powershell
gcloud secrets versions add smartcare-openai-key --data-file=path\to\openai-key.txt --project=agile-team-509312-u8
```

3. **Redeploy** (next step).  
   Cloud Run does not always reload secret values until a new revision is deployed.

## C4. Deploy or redeploy the app

From the **project root** (the folder that contains `cloudbuild.yaml`):

```powershell
cd path\to\MentalCapstone
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG=v7 --project=agile-team-509312-u8
```

### How to choose `_TAG`

Use a new tag each release, for example: `v6`, `v7`, `v8`…

### What happens during deploy

1. Cloud Build builds a Docker image from `backend/`.  
2. It pushes the image to Artifact Registry.  
3. It deploys Cloud Run service `smartcare` with the env vars and secrets from `cloudbuild.yaml`.  
4. When the new container starts, it automatically:
   - runs database migrations  
   - ensures the Head Doctor account exists  
   - syncs web assets to the public bucket (when configured)  
   - starts Apache

**Success looks like:** the build ends with `STATUS = SUCCESS`, and the website still opens.

Typical time: several minutes (often ~5–15).

## C5. Seed demo / mobile accounts on production (optional)

Only when you need sample mobile users/data on the live database:

```powershell
gcloud run jobs execute smartcare-seed --region=asia-southeast1 --project=agile-team-509312-u8 --wait
```

This runs `php artisan db:seed --force` against Cloud SQL.  
Prefer this over wiping production tables.

> Never run `migrate:fresh` on production. That deletes live data.

## C6. Confirm production is healthy

### Quick browser / API check

```powershell
Invoke-WebRequest https://smartcare-zdi2psmkca-as.a.run.app/api/v1/app-config
```

You want status **200**.

Also open: https://smartcare-zdi2psmkca-as.a.run.app/web/login.html

### Optional automated API checks from the mobile folder

```powershell
cd mobile-rn
npm run test:prod
```

More detail: [mobile-rn/tests/README.md](mobile-rn/tests/README.md).

---

# Reference

## How accounts work

1. Head Doctor signs in on the **web**.  
2. Goes to **Staff → Create account**.  
3. SmartCare emails a verification link.  
4. The new user opens the link (`/web/verify-email.html`).  
5. Only then can they log in with username/password (or Google, if enabled for that user).

### Change password

- **Web:** Settings  
- **Mobile:** Profile → Change password  

---

## Demo accounts (after local seed)

Password for seeded users: **`password`**

### Web

| Username | Role |
|----------|------|
| `headdoctor` | Head Doctor |
| `psycho` | Psychometrician |
| `teacher` | Teacher |
| `caretaker` | Caretaker |
| `parent` | Parent |

### Mobile

| Username | Role |
|----------|------|
| `mobile_teacher` | Teacher |
| `mobile_caretaker` | Caretaker |
| `mobile_parent` | Parent |

Production Head Doctor is created/ensured by the server command `smartcare:ensure-head-doctor` (username/password come from that command’s env/config). Change the password after first login and do not publish production passwords in shared docs.

---

## Image & file storage (simple explanation)

SmartCare stores files in **two places**:

| Type of file | Where (production) | Can anyone with the link open it? |
|--------------|--------------------|-----------------------------------|
| Profile avatars, learning materials, website banners | **Public** Google Cloud Storage bucket | Yes (public HTTPS URL) |
| Progress photos, gallery photos, sensitive child docs | **Private** Google Cloud Storage bucket | No — only through logged-in API download/view |

### Local development

| Type | Where on your PC |
|------|------------------|
| Public-style media | Local Laravel `public` storage (when GCS bucket is empty) |
| Private media | `storage/app/private` (`PRIVATE_MEDIA_DISK=local`) |

That is why `php artisan storage:link` matters locally for public uploads.

---

## Google Sign-In (web + mobile)

1. In Google Cloud Console, use an OAuth client of type **Web**.  
2. Add authorized JavaScript origins, for example:
   - `https://smartcare-zdi2psmkca-as.a.run.app`
   - `http://localhost`
   - `http://127.0.0.1`
3. Put that client ID in:
   - Production secret: `smartcare-google-client-id`
   - Local backend: `GOOGLE_CLIENT_ID` in `backend/.env`
   - Mobile: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `mobile-rn/.env` (and in EAS `eas.json` for APK builds)
4. Google Sign-In only works for users who **already exist** in SmartCare.

---

## Email (verification messages)

| Environment | What happens |
|-------------|--------------|
| Local (`MAIL_MAILER=log`) | Email is written to `backend/storage/logs/laravel.log` — open that file and copy the verification URL |
| Production (`MAIL_MAILER=resend`) | Real email via [Resend](https://resend.com) using Secret Manager (`smartcare-resend-key` + `smartcare-mail-from`) |

### Resend setup (production)

1. Create a Resend account and verify your sending domain (DNS records in the Resend dashboard).
2. Create an API key and a from-address on that domain (e.g. `noreply@yourdomain.com`).
3. Store them in Secret Manager, then redeploy:

```powershell
# API key only in the file (no quotes / blank lines)
gcloud secrets create smartcare-resend-key --data-file=path\to\resend-key.txt --project=agile-team-509312-u8
# Or update an existing secret:
gcloud secrets versions add smartcare-resend-key --data-file=path\to\resend-key.txt --project=agile-team-509312-u8

# From-address (plain text file containing only the email)
gcloud secrets create smartcare-mail-from --data-file=path\to\mail-from.txt --project=agile-team-509312-u8
gcloud secrets versions add smartcare-mail-from --data-file=path\to\mail-from.txt --project=agile-team-509312-u8
```

Until the domain is verified in Resend, verification emails will keep failing with `mail_sent: false` even though the API returns HTTP 200.

---

## OpenAI (AI recommendations)

In `backend/.env` (local) or Secret Manager (production):

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_FAKE=true    # local/demo: do not call OpenAI
OPENAI_FAKE=false   # production: call OpenAI for real
```

Even with real AI, teachers still **review** recommendations before they become care plans.

Never commit API keys to git.

---

## Folder map (what each folder is for)

```
MentalCapstone/
├── backend/          ← API server + web files under public/web
├── web/              ← Dashboard source files (synced into backend/public/web and GCS)
├── mobile-rn/        ← Expo mobile app
├── cloudbuild.yaml   ← “Build Docker image and deploy to Cloud Run” recipe
├── DEPLOY.md         ← Short production reminder
└── README.md         ← This guide
```

---

## Everyday commands (cheat sheet)

Start from the repo root (`MentalCapstone/`), then `cd` into the folder shown.

### Local backend (daily)

```powershell
cd backend
php artisan serve
```

### Local mobile (daily)

```powershell
cd mobile-rn
npx expo start
```

### Rebuild production

```powershell
# from repo root
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG=v8 --project=agile-team-509312-u8
```

### Rebuild Android preview APK

```powershell
cd mobile-rn
npx eas-cli build --platform android --profile preview --non-interactive
```

### Backend tests

```powershell
cd backend
php artisan test
```

### Mobile API tests against local server

```powershell
cd mobile-rn
npm run test:all:local
```

---

## Troubleshooting

| Problem | Likely fix |
|---------|------------|
| `php` / `composer` not found | Add XAMPP PHP (and Composer) to PATH for that terminal |
| Database errors / empty app | Run `migrate:fresh --seed` locally; confirm SQLite file or MySQL settings |
| Web page not found | Use http://127.0.0.1:8000/web/login.html and confirm `backend/public/web` exists |
| Uploaded images broken locally | Run `php artisan storage:link` |
| Phone cannot connect to local API | Use `--host=0.0.0.0`, set LAN IP in mobile `.env`, same Wi‑Fi, open firewall port 8000 |
| Emulator cannot reach API | Use `http://10.0.2.2:8000/api/v1` |
| Login says unverified / 403 | Open the verification link (local: find it in `storage/logs/laravel.log`) |
| Google Sign-In fails | Same Web client ID on backend + mobile; user must already exist; check authorized origins |
| AI always looks “fake” / template | Set `OPENAI_FAKE=false` and provide a valid `OPENAI_API_KEY` |
| New OpenAI key ignored in prod | Add secret version, then **redeploy** Cloud Run |
| Gallery / progress photos blank in prod | User must be logged in; private bucket must not be public; `PRIVATE_MEDIA_DISK=gcs_private` |
| `gcloud` auth expired | Run `gcloud auth login` again |
| Mobile crashes opening the camera/gallery | In `mobile-rn` run `npx expo install --fix`, then rebuild the APK |

---

## Security reminders

1. Never commit `.env`, passwords, OpenAI keys, or Google service-account JSON files.  
2. Keep production secrets in **Secret Manager**, not in the repo.  
3. Keep private child photos on the **private** bucket only.  
4. Use PHP **8.2.35+** (the production Docker image is pinned to that).  
5. If a key was pasted into chat or a ticket, rotate it.

---

## Need a shorter production reminder?

See [DEPLOY.md](DEPLOY.md) for the short “live URLs + redeploy” card.  
**This README is the full instruction manual.**
