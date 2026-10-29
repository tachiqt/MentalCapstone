# Tasks: SmartCare Platform

## Phase 0 — Scaffold
- [ ] T001 Create Laravel 11 project in `backend/`
- [ ] T002 Install Sanctum; configure API + CORS
- [ ] T003 Add `.env.example` with OpenAI + DB vars
- [ ] T004 Role enum seeder (demo users)

## Phase 1 — Identity & children
- [ ] T005 Extend users migration with role/status
- [ ] T006 children + child_user migrations/models
- [ ] T007 Auth controllers: login/logout/me
- [ ] T008 Users CRUD (head_doctor only)
- [ ] T009 Children CRUD + assign endpoints + policies

## Phase 2 — Assessments
- [ ] T010 checklist + checklist_items migrations
- [ ] T011 assessments + assessment_responses
- [ ] T012 Checklist CRUD APIs
- [ ] T013 Assessment submit/list/history APIs

## Phase 3 — OpenAI
- [ ] T014 ai_recommendations table
- [ ] T015 OpenAIRecommendationService + Job
- [ ] T016 Generate + review endpoints
- [ ] T017 Feature tests with mocked OpenAI HTTP

## Phase 4 — Therapy & materials
- [ ] T018 learning_materials + therapy_plans/sessions
- [ ] T019 Materials upload APIs
- [ ] T020 Session CRUD + ScheduleSuggestionService

## Phase 5 — Medication
- [ ] T021 medication_schedules + medication_logs
- [ ] T022 Teacher schedule CRUD; caretaker log APIs

## Phase 6 — Parent & reports
- [ ] T023 progress_records, parent_feedback, notifications
- [ ] T024 Parent read APIs + feedback
- [ ] T025 Facility/child report endpoints

## Phase 7 — UI, docs, deploy
- [ ] T026 Persist design system; PRODUCT.md + DESIGN.md
- [ ] T027 Web Operate UI (login + dashboards)
- [ ] T028 Flutter scaffold with API base URL config
- [ ] T029 Postman collection + README + DEPLOY.md
- [ ] T030 Feature tests for auth/RBAC/assessment/AI review — includes `RoleOperationalSustainabilityTest` (5-role operational journeys + cross-role guards), `PsychometricianRbacTest`, `AssessmentAiFlowTest`, `AuthTest`
