---
title: "QA v2.7-v2.8: squads/config profiles E2E and PGlite test harness"
author: PCode
date: 2026-11-24
branch: qa/v280-squads-92
id: l-06d4dfe5
scope: repo
status: active
src: agent
touches:
  - backend/test/config-profiles.e2e-pg-spec.ts
  - backend/test/squads.e2e-pg-spec.ts
  - backend/test/devices.e2e-pg-spec.ts
  - bench/scenarios/smoke.js
  - docs/reports/v2.8.0-squads-qa.md
---

Why: v2.7/v2.8 added config profiles (#90, PR #94) and squads (#92, PR #96) with no QA coverage; agent 2 zone is backend/test, .github/workflows, docs/reports, bench - product code stays untouched. How: new PG e2e specs settings/config-profiles/squads pattern - TABLES with TRUNCATE RESTART IDENTITY CASCADE in beforeAll/afterAll, admin login via setup-env-pg.js, supertest default import, agent-token read of the applied node config for generator assertions. Watch out: local PGlite socket server reuses prepared statements across sessions, so a second run against the same dir fails with 42P05; start a fresh data dir/port per run and add ?pgbouncer=true for multi-file suites. That query param makes psql reject it, so the two old backup tests in v15.e2e-pg-spec.ts always fail locally (CI on real PostgreSQL 16 is authoritative). Squads are global (no organizationId) and PATCH /squads/:id/members accepts cross-tenant user ids; per-user updates remain tenant-scoped - documented as a product finding, not encoded as expected behaviour. v2.9 devices tests are registered with describe.skip until POST /api/devices/bind exists.
