# Mobile test accounts

All passwords: **`password`**

Accounts are created by the **Head Doctor** in the web dashboard (Staff → Create account). Mobile self-signup is disabled.

| Username | Role | Use for |
|----------|------|---------|
| `mobile_teacher` | Teacher | Home, AI Review, Therapy, Materials, Medication tabs |
| `mobile_caretaker` | Caretaker | Today doses, Log, Children tabs |
| `mobile_parent` | Parent | Progress, Therapy, Feedback tabs |

Legacy sample accounts (same password, more sample data linked):

| Username | Role |
|----------|------|
| `teacher` | Teacher |
| `caretaker` | Caretaker |
| `parent` | Parent |

## Which backend the app talks to

`EXPO_PUBLIC_API_URL` in `.env` decides this, and it ships pointed at the Cloud Run
service, so the app reads the same Cloud SQL records and Cloud Storage media the web
dashboard uses. These accounts exist in the cloud database, so nothing local is
needed to run the app.

Metro only reads `.env` at startup — restart it after changing that value.

To work against a local backend instead, set it to `http://10.0.2.2:8000/api/v1`
(Android emulator) and run:

```powershell
$env:Path = "C:\xampp\php;" + $env:Path
cd backend
php artisan serve --host=0.0.0.0
```

Commenting the variable out makes `lib/config.ts` guess: the Metro LAN host, else
`http://10.0.2.2:8000/api/v1` on Android, else `127.0.0.1`.

## Automated checks

`npm test` runs the live API integration suite against every endpoint these
accounts use. See [tests/README.md](tests/README.md).

## Seed mobile accounts + demo data

Locally:

```powershell
cd backend
php artisan db:seed --class=MobileTestAccountsSeeder
php artisan db:seed --class=MobileDemoDataSeeder
```

Or full reset with everything:

```powershell
php artisan migrate:fresh --seed
```

Against production Cloud SQL, use the `smartcare-seed` Cloud Run job. It runs the
deployed image with the live service's environment, so it reaches the database over
the Cloud SQL socket and writes media to the same bucket. The seeders are
idempotent, so re-running will not duplicate anything:

```powershell
gcloud run jobs execute smartcare-seed --region=asia-southeast1 --wait
```

### What each account can see

| Account | Demo data |
|---------|-----------|
| `mobile_teacher` | Lucas & Emma assigned, therapy sessions, medication schedules, 1 pending AI review |
| `mobile_caretaker` | Today's doses (Melatonin, Vitamin D), medication logs, assigned children |
| `mobile_parent` | Lucas & Emma progress, upcoming therapy, feedback history |
