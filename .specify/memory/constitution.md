# SmartCare Constitution

## Core Principles

### I. Single-Facility Scope
SmartCare serves Malvar Assisted Facility and Therapy Center only (~52 children). No multi-tenant HIS, no external hospital integration.

### II. RBAC Is Non-Negotiable
Five roles only: Head Doctor, Psychometrician, Teacher, Caretaker, Parent. Every API route and UI surface enforces role policies. Parents see only linked children.

### III. Human-in-the-Loop AI
OpenAI generates learning/intervention **recommendations** only. Teachers must approve, modify, or reject before recommendations become therapy plans. AI never diagnoses and never suggests medication changes.

### IV. API-Only Data Access
Web and Flutter clients never connect to MySQL. Laravel HTTPS REST API (`/api/v1`) is the sole data path. DB credentials never ship in mobile apps. MySQL port stays closed to the public internet.

### V. Child Data Privacy
Least privilege on sensitive records. OpenAI prompts use internal child id + age band + structured assessment fields — minimize PII. Audit assessment submit, AI generate, recommendation review, and medication logs.

### VI. Functional Parity With Capstone Specs
Deliver Chapter 3 functional requirements (FR-001–014) and non-functional requirements (NFR-01–07). Support later ISO/IEC 25010 evaluation. Prefer minimal diffs; freeze API contracts early for Flutter.

### VII. Design System Authority
UI follows `design-system/MASTER.md` and Impeccable `DESIGN.md` / `PRODUCT.md`. Clinical Operate-mode UX: calm, accessible, not generic purple SaaS chrome.

## Technology Constraints

- Backend: Laravel 11 (PHP 8.2+), MySQL 8 / MariaDB compatible
- Auth: Laravel Sanctum (bearer tokens for mobile + web)
- AI: OpenAI API (`gpt-4o-mini` default), queued when possible
- Web: Head Doctor + Psychometrician
- Mobile: Flutter for Teacher, Caretaker, Parent
- Deploy: VPS/shared host with HTTPS; Flutter release APK points at public API URL

## Development Workflow

1. Spec Kit: constitution → specify → clarify → plan → tasks → implement
2. UI/UX Pro Max: persist design system before major UI
3. Implement backend phases 0–7, then web/Flutter against frozen APIs
4. Impeccable: shape / audit / polish Operate surfaces
5. Deploy with `APP_DEBUG=false`, backups, OpenAI key only in server `.env`

## Governance

Amend this constitution when facility scope, roles, or AI safety rules change. Spec Kit plans and tasks must remain consistent with these principles.
