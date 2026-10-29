# Implementation Plan: SmartCare Platform

**Branch**: `001-smartcare-platform`  
**Date**: 2026-08-08

## Summary

Build a Laravel 11 REST API with MySQL, Sanctum RBAC, and OpenAI recommendation service serving web (Head Doctor, Psychometrician) and Flutter (Teacher, Caretaker, Parent). Spec Kit + UI/UX Pro Max + Impeccable guide process and UI craft.

## Technical Context

| Area | Choice |
|------|--------|
| Language | PHP 8.2+ |
| Framework | Laravel 11 |
| Auth | Sanctum API tokens |
| DB | MySQL 8 / MariaDB (XAMPP); SQLite for tests |
| AI | OpenAI Chat Completions + JSON schema |
| Files | Laravel Storage (`public` disk for materials) |
| Clients | `web/` HTML+CSS+JS; `mobile/` Flutter scaffold |
| Design | `design-system/MASTER.md` + `DESIGN.md` / `PRODUCT.md` |

## Architecture

```
Clients (Web/Flutter) → HTTPS /api/v1 → Laravel (RBAC) → MySQL
                                      → OpenAI (recommendations only)
                                      → Storage (materials)
```

## Project Structure

```
MentalCapstone/
  backend/                 # Laravel API
  web/                     # Head Doctor / Psychometrician UI
  mobile/                  # Flutter app scaffold
  design-system/           # UI/UX Pro Max MASTER + pages
  specs/001-smartcare-platform/
  .specify/
  .cursor/skills/
  PRODUCT.md
  DESIGN.md
  DEPLOY.md
```

## Phases

0. Scaffold Laravel + Sanctum + seeds  
1. Users + children + assignments  
2. Checklists + assessments  
3. OpenAI recommendations + review  
4. Materials + therapy sessions + schedule suggest  
5. Medication schedules + logs  
6. Parent progress + feedback + reports  
7. Web UI (Impeccable Operate) + Flutter scaffold + tests + deploy docs  

## Constitution Check

- Single facility, RBAC, HITL AI, API-only DB, privacy, design system — all satisfied by this plan.
