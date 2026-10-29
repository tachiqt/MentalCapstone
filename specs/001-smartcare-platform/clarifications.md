# Clarifications

Resolved before plan (2026-08-08):

1. **Automated scheduling** — Deterministic service using therapy frequency + teacher availability; not OpenAI.
2. **Medication log statuses** — `given`, `skipped`, `missed`.
3. **Reports** — JSON aggregates for MVP; PDF later.
4. **OpenAI** — `gpt-4o-mini` default; structured JSON; teacher review required.
5. **Local DB** — SQLite for PHPUnit; MySQL/MariaDB for XAMPP/production.
