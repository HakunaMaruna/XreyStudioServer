---
title: "QA v2.9-v2.13: devices, health checks, templates, geodata E2E"
author: PCode
date: 2026-11-24
branch: qa/v2914-107
id: l-da707f5c
scope: repo
status: active
src: agent
touches:
  - backend/test/devices.e2e-pg-spec.ts
  - backend/test/health-checks.e2e-pg-spec.ts
  - backend/test/subscription-templates.e2e-pg-spec.ts
  - backend/test/geodata.e2e-pg-spec.ts
  - bench/scenarios/smoke.js
  - docs/reports/qa-v2.15.md
---

Why: issue #107 required E2E for the v2.9-v2.13 APIs (devices, health-checks, subscription-templates, geodata) and the old devices spec was a pending draft. How: follow the squads/config-profiles PG e2e pattern - TRUNCATE all tables in beforeAll/afterAll, app.init with ValidationPipe and global /api prefix, admin login with ADMIN_PASSWORD (not the suite's local user password), supertest default import; health-check probes are driven by calling HealthChecksService.run() against a real temporary TCP listener and a closed port. Live smoke PROTECTED list now includes all four endpoints. Watch out: deviceLimit from user DTO/UI is never persisted (issue #118), so limit tests must set it via Prisma; ?hwid= is only checked on GET /subscriptions/:token, the direct /raw|base64|clash|singbox|json routes bypass it (issue #119). PGlite socket server survived only the first suite here (Prisma then reports Can't reach database server); prefer real PostgreSQL 16, and if PGlite is used the pgdata-v213 cluster needs shared_memory_type=mmap plus dynamic_shared_memory_type=mmap under the LD_PRELOAD shim. CI smoke secrets LIVE_ADMIN_EMAIL/LIVE_ADMIN_PASSWORD are empty, so authenticated smoke and node ONLINE remain skipped.
