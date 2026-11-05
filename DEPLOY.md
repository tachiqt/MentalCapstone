# SmartCare — quick production card

For the **full step-by-step guide** (local + mobile + GCP), open **[README.md](README.md)**.

## Live links

| What | URL |
|------|-----|
| App / API | https://smartcare-zdi2psmkca-as.a.run.app |
| Web dashboard | https://smartcare-zdi2psmkca-as.a.run.app/web/ |
| API | https://smartcare-zdi2psmkca-as.a.run.app/api/v1 |
| Public assets | https://storage.googleapis.com/agile-team-509312-u8-smartcare/smartcare/assets/web/ |

## Redeploy (after code or secret changes)

```powershell
cd path\to\MentalCapstone
gcloud auth login
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG=v10 --project=agile-team-509312-u8
```

Use a new `_TAG` each time (`v9`, `v10`, …).  
If you only changed a Secret Manager value, you still need a redeploy so Cloud Run loads the new version.

## Seed demo data on production (optional)

```powershell
gcloud run jobs execute smartcare-seed --region=asia-southeast1 --project=agile-team-509312-u8 --wait
```

## Quick health check

```powershell
Invoke-WebRequest https://smartcare-zdi2psmkca-as.a.run.app/api/v1/app-config
```

Expect status **200**.
