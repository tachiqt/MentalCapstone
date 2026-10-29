# SmartCare Mobile

Minimal Flutter scaffold for the SmartCare mobile client (Teacher, Caretaker, Parent roles).

## Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (3.0+)
- Laravel API running locally (`php artisan serve` from `backend/`)

## Setup

```bash
cd mobile
flutter pub get
```

## Run

```bash
flutter run
```

## API base URL

Edit `lib/config.dart`:

| Environment | `apiBaseUrl` |
|-------------|--------------|
| Android emulator | `http://10.0.2.2:8000/api/v1` (default) |
| iOS simulator | `http://127.0.0.1:8000/api/v1` |
| Physical device | Your machine's LAN IP, e.g. `http://192.168.1.10:8000/api/v1` |

Ensure the backend is reachable from the device/emulator and CORS is not required for native HTTP clients.

## Demo credentials

| Username | Password | Role |
|----------|----------|------|
| teacher | password | Teacher |
| caretaker | password | Caretaker |
| parent | password | Parent |

## Project structure

```
lib/
  main.dart          — MaterialApp, login, home placeholder
  config.dart        — API base URL
  api/client.dart    — HTTP client (login, getMe, logout)
```

## Design

Operate mode using SmartCare tokens from `DESIGN.md`:

- Primary `#0891B2`, accent `#059669`, background `#ECFEFF`
- Figtree (headings) + Noto Sans (body) via `google_fonts`
