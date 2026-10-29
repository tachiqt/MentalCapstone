# Feature Specification: SmartCare Platform

**Feature Branch**: `001-smartcare-platform`  
**Created**: 2026-08-08  
**Status**: Specified  
**Input**: Capstone Chapters 1–3 + SMARTCARE-TAF; Laravel + MySQL + OpenAI + Flutter

## User Scenarios & Testing

### User Story 1 - Head Doctor Administration (Priority: P1)

As Head Doctor, I manage staff accounts, assessment checklists, child lists, and facility reports from the web app.

**Why this priority**: Without admin + checklists, assessments and AI cannot run.

**Independent Test**: Create/deactivate users, CRUD checklist, view child list and summary counts.

**Acceptance Scenarios**:

1. **Given** valid Head Doctor credentials, **When** I log in, **Then** I receive a Sanctum token and role `head_doctor`.
2. **Given** I am Head Doctor, **When** I create a psychometrician account, **Then** that user can log in with role `psychometrician`.
3. **Given** I create a checklist with items, **When** psychometricians list checklists, **Then** the new checklist is available.

### User Story 2 - Psychometrician Assessment (Priority: P1)

As Psychometrician, I encode assessments and severity so AI can recommend interventions.

**Acceptance Scenarios**:

1. **Given** a checklist and child, **When** I submit assessment responses + severity, **Then** assessment is stored and linked to the child.
2. **Given** a finalized assessment, **When** I request AI recommendations, **Then** a `pending_review` recommendation is created.

### User Story 3 - Teacher Therapy & AI Review (Priority: P1)

As Teacher (mobile), I review AI recommendations, schedule therapy, manage materials and medication schedules, and record session outcomes.

**Acceptance Scenarios**:

1. **Given** a pending recommendation, **When** I approve/modify/reject, **Then** status updates and approved items can become therapy plans.
2. **Given** a therapy plan, **When** I create sessions or accept suggested slots, **Then** sessions appear for assigned children.
3. **Given** a medication schedule I create, **When** caretakers view assigned children, **Then** they see today’s doses.

### User Story 4 - Caretaker Medication (Priority: P2)

As Caretaker, I view medication schedules for assigned children and log given/skipped doses.

### User Story 5 - Parent Progress (Priority: P2)

As Parent, I view my child’s progress, therapy updates, and submit feedback via mobile.

## Requirements

### Functional

- **FR-001/002**: Secure login/logout (username/password → Sanctum token).
- **FR-003/004/005**: Head Doctor user management; role-based authorization.
- **FR-006**: Parents access progress via mobile API.
- **FR-007**: Child profiles (demographics, conditions, assignments).
- **FR-008/009/010**: Assessment and therapy documentation with history access.
- **FR-011/012/013**: Therapy scheduling, modify/cancel, completion tracking.
- **FR-014**: Deterministic schedule suggestions (not OpenAI).
- **FR-AI**: OpenAI structured recommendations; teacher review required.
- **FR-MED**: Medication schedules + administration logs.
- **FR-MAT**: Learning material upload/list/assign.
- **FR-FB**: Parent feedback records.
- **FR-REP**: Facility and child progress reports for authorized roles.

### Non-Functional

- NFR security, privacy, reliability, usability, performance per Chapter 3.
- AI disclaimer: recommendations are decision support only.

### Key Entities

- User, Child, ChildUser assignment, AssessmentChecklist, Assessment, AiRecommendation, LearningMaterial, TherapyPlan, TherapySession, MedicationSchedule, MedicationLog, ProgressRecord, ParentFeedback, Notification, ActivityLog

## Clarifications (resolved)

- Schedule suggestions: frequency + teacher availability windows; teacher confirms.
- Medication log: statuses `given` | `skipped` | `missed` with timestamp + caretaker.
- Reports: JSON aggregates (counts by role, sessions completed, pending AI reviews); PDF out of scope for MVP.
- OpenAI model: `gpt-4o-mini` via `OPENAI_MODEL` env.
- SQLite allowed for local/CI tests; MySQL/MariaDB for production/XAMPP.

## Success Criteria

- All five roles authenticate and are blocked from cross-role mutations.
- Assessment → AI draft → teacher review path works end-to-end (OpenAI mockable in tests).
- Flutter/web consume same `/api/v1` contracts.
- MySQL never exposed to clients.

## Role Operational Sustainability Tests

Operational test matrix derived from [PRODUCT.md](../../PRODUCT.md) user roles and constitution principle II (RBAC). Automated coverage lives in `backend/tests/Feature/RoleOperationalSustainabilityTest.php`.

### Head Doctor (web)

**Independent Test**: Head Doctor can run a full facility-administration day — staff onboarding, checklist publish, workspace config, facility report, therapy scheduling — and psychometricians can consume published checklists.

| Operation | API endpoint(s) | Expected | Automated test |
|-----------|-----------------|----------|----------------|
| Web login | `POST /api/v1/login` (`client: web`) | 200 + token + `head_doctor` | `test_head_doctor_sustains_facility_administration_flow` |
| Create psychometrician | `POST /api/v1/users` | 201 | `test_head_doctor_sustains_facility_administration_flow` |
| Publish checklist | `POST /api/v1/checklists` | 201 | `test_head_doctor_sustains_facility_administration_flow` |
| Facility report | `GET /api/v1/reports/facility` | 200 aggregates | `test_head_doctor_sustains_facility_administration_flow` |
| Workspace settings | `PUT /api/v1/workspace` | 200 | `test_head_doctor_sustains_facility_administration_flow` |
| Schedule therapy | `POST /api/v1/therapy-sessions` | 201 | `test_head_doctor_sustains_facility_administration_flow` |
| Psycho reads checklist | `GET /api/v1/checklists` (as psycho) | 200 includes new checklist | `test_head_doctor_sustains_facility_administration_flow` |

### Psychometrician (web)

**Independent Test**: Psychometrician can register a child, score an assessment, request an AI draft, and read child + workspace summaries without admin or clinical-delivery mutations.

| Operation | API endpoint(s) | Expected | Automated test |
|-----------|-----------------|----------|----------------|
| Web login | `POST /api/v1/login` (`client: web`) | 200 + token | `test_psychometrician_sustains_assessment_workflow` |
| Register child | `POST /api/v1/children` | 201 | `test_psychometrician_sustains_assessment_workflow` |
| Read checklist | `GET /api/v1/checklists/{id}` | 200 | `test_psychometrician_sustains_assessment_workflow` |
| Submit assessment | `POST /api/v1/children/{id}/assessments` | 201 | `test_psychometrician_sustains_assessment_workflow` |
| Generate AI draft | `POST /api/v1/children/{id}/recommendations/generate` | 201 `pending_review` | `test_psychometrician_sustains_assessment_workflow` |
| Child report | `GET /api/v1/reports/children/{id}` | 200 | `test_psychometrician_sustains_assessment_workflow` |
| Psycho summary | `GET /api/v1/reports/psychometrician-summary` | 200 counters | `test_psychometrician_sustains_assessment_workflow` |
| Blocked: staff admin | `POST /api/v1/users` | 403 | `test_psychometrician_sustains_assessment_workflow`, `test_cross_role_mutations_are_blocked` |
| Blocked: checklist write | `POST /api/v1/checklists` | 403 | `test_psychometrician_sustains_assessment_workflow` |
| Blocked: therapy / AI review | `POST /api/v1/therapy-sessions`, `POST /api/v1/recommendations/{id}/review` | 403 | `test_psychometrician_sustains_assessment_workflow` |

### Teacher (mobile)

**Independent Test**: Teacher can review AI recommendations, schedule therapy, create medication schedules, and upload learning materials; cannot use web login or encode assessments.

| Operation | API endpoint(s) | Expected | Automated test |
|-----------|-----------------|----------|----------------|
| Approve AI recommendation | `POST /api/v1/recommendations/{id}/review` | 200 `approved` | `test_teacher_sustains_clinical_delivery_flow` |
| Schedule therapy | `POST /api/v1/therapy-sessions` | 201 | `test_teacher_sustains_clinical_delivery_flow` |
| Medication schedule | `POST /api/v1/medication-schedules` | 201 | `test_teacher_sustains_clinical_delivery_flow` |
| Learning material | `POST /api/v1/learning-materials` | 201 | `test_teacher_sustains_clinical_delivery_flow` |
| Blocked: web login | `POST /api/v1/login` (`client: web`) | 403 | `test_teacher_sustains_clinical_delivery_flow` |
| Blocked: staff / assessments | `POST /api/v1/users`, `POST /api/v1/children/{id}/assessments` | 403 | `test_teacher_sustains_clinical_delivery_flow`, `test_cross_role_mutations_are_blocked` |
| Blocked: delete materials | `DELETE /api/v1/learning-materials/{id}` | 403 | `test_cross_role_mutations_are_blocked` |

### Caretaker (mobile)

**Independent Test**: Caretaker can log medication doses for assigned children and view logs; cannot create schedules or admin accounts.

| Operation | API endpoint(s) | Expected | Automated test |
|-----------|-----------------|----------|----------------|
| Log dose | `POST /api/v1/medication-logs` | 201 | `test_caretaker_sustains_medication_logging_flow` |
| View logs | `GET /api/v1/children/{id}/medication-logs` | 200 | `test_caretaker_sustains_medication_logging_flow` |
| Blocked: create schedule | `POST /api/v1/medication-schedules` | 403 | `test_caretaker_sustains_medication_logging_flow`, `test_cross_role_mutations_are_blocked` |
| Blocked: staff admin | `POST /api/v1/users` | 403 | `test_caretaker_sustains_medication_logging_flow` |

### Parent (mobile)

**Independent Test**: Parent can read child progress, submit feedback, and list feedback; cannot mutate clinical records.

| Operation | API endpoint(s) | Expected | Automated test |
|-----------|-----------------|----------|----------------|
| Read progress | `GET /api/v1/children/{id}/progress` | 200 | `test_parent_sustains_progress_and_feedback_flow` |
| Submit feedback | `POST /api/v1/parent-feedback` | 201 | `test_parent_sustains_progress_and_feedback_flow` |
| List feedback | `GET /api/v1/children/{id}/parent-feedback` | 200 includes submission | `test_parent_sustains_progress_and_feedback_flow` |
| Blocked: assessments | `POST /api/v1/children/{id}/assessments` | 403 | `test_parent_sustains_progress_and_feedback_flow` |
| Blocked: medication logs | `POST /api/v1/medication-logs` | 403 | `test_parent_sustains_progress_and_feedback_flow` |
| Blocked: progress write | `POST /api/v1/children/{id}/progress` | 403 | `test_cross_role_mutations_are_blocked` |

### Cross-role mutation guard

**Independent Test**: Each role receives `403 Forbidden` on representative mutations reserved for other roles.

| Automated test |
|----------------|
| `test_cross_role_mutations_are_blocked` |

### Manual web checklist (Head Doctor / Psychometrician)

API tests do not cover web UI role chrome. After deploy or UI changes, verify manually:

1. **Psychometrician login** (`psycho` / `password`) lands on assessments or allowed workspace; sidebar shows Dashboard, Children, Checklists, Assessments, Reports, Settings, Help only.
2. **`data-web-roles` nav**: Staff, Therapy, Medication, Materials links hidden for psychometrician.
3. **User badge** in header shows name + role (not stuck on “Loading…”).
4. **Checklists page** shows read-only banner; create checklist controls disabled/hidden.
5. **Head Doctor login** shows full nav including Staff, Therapy, Medication, Materials.
6. **Search placeholder** for psychometrician reads “Search children…” (not staff/sessions).
