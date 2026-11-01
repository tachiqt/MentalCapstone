# SmartCare

AI-assisted learning and progress companion for Malvar Assisted Facility and Therapy Center.

## Stack

- **Backend:** Laravel 11 + Sanctum + MySQL/SQLite + OpenAI
- **Web:** Head Doctor & Psychometrician (`backend/public/web` or `/web`)
- **Mobile:** React Native + Expo + TypeScript (`mobile/`) for Teacher, Caretaker, and Parent
- **Tooling:** Spec Kit, UI/UX Pro Max, Impeccable

## Quick Start (Backend)

```powershell
$env:Path = "C:\xampp\php;C:\Program Files\7-Zip;" + $env:Path
cd backend

# Ensure database/database.sqlite exists (or set MySQL in .env)
php artisan migrate:fresh --seed
php artisan serve
```

### Demo Logins

Default password: `password`

| Username | Role |
|----------|------|
| headdoctor | Head Doctor |
| psycho | Psychometrician |
| teacher | Teacher |
| caretaker | Caretaker |
| parent | Parent |

Sample data includes 4 children, 2 checklists, assessments (pending AI, awaiting review, approved), therapy sessions, medication logs, learning materials, progress records, and parent feedback.

Re-seed anytime:

```powershell
php artisan migrate:fresh --seed
```

**API Base:** `http://127.0.0.1:8000/api/v1`

**Web UI:** `http://127.0.0.1:8000/web/`

## Quick Start (Mobile - Expo + TypeScript)

The mobile application is built using **React Native with Expo and TypeScript**, providing role-based access for Teachers, Caretakers, and Parents.

### Prerequisites

- Node.js (LTS)
- npm
- Expo Go (for physical device testing)
- Android Emulator or iOS Simulator (optional)

### Installation

Navigate to the mobile directory:

```powershell
cd mobile
```

Install dependencies:

```powershell
npm install
```

Start the Expo development server:

```powershell
npx expo start
```

You can launch the application using:

- **Android:** Scan the QR code using Expo Go or press `a` for an Android emulator.
- **iOS:** Scan the QR code using Expo Go on iOS or press `i` for an iOS simulator on macOS.
- **Web (if configured):** Press `w` to launch the Expo web application.

### Backend API Connection

Configure the mobile application to communicate with the Laravel backend.

Example Expo environment configuration (`mobile/.env`):

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000/api/v1
```

Replace `192.168.1.100` with your computer's local IP address when testing on a physical device.

Start Laravel with network access:

```powershell
php artisan serve --host=0.0.0.0
```

Access the environment variable in TypeScript:

```typescript
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
```

**Note:** Both your development computer and mobile device should be connected to the same local network. Do not put API secrets in `EXPO_PUBLIC_` variables.

## OpenAI

Set the following in `backend/.env`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_FAKE=false
```

Keep `OPENAI_FAKE=true` for local/demo testing without calling OpenAI.

AI-generated recommendations must still be reviewed by authorized personnel, including Teachers, before being used.

## Tests

### Backend Tests

```powershell
cd backend
php artisan test
```

### Mobile TypeScript Validation

```powershell
cd mobile
npx tsc --noEmit
```

## Design

See the following project documentation:

- `DESIGN.md` - UI/UX guidelines and visual design
- `PRODUCT.md` - Product requirements and features
- `design-system/smartcare/MASTER.md` - SmartCare design system

## Deploy

See [DEPLOY.md](DEPLOY.md) for backend and web deployment instructions.

For mobile builds and distribution, use **Expo Application Services (EAS)**.

Install the EAS CLI:

```powershell
npm install -g eas-cli
```

Configure EAS:

```powershell
cd mobile
eas login
eas build:configure
```

Build for Android:

```powershell
eas build --platform android
```

Build for iOS:

```powershell
eas build --platform ios
```

Production mobile builds must use a reachable HTTPS backend API instead of a local development address.
