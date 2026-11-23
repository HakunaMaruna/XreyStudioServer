---
title: "v1.5.0 backups UI, CSV reporting, Redis throttling and k8s monitoring"
author: XSS
date: 2026-11-23
branch: main
id: l-fb45e1ef
scope: repo
status: active
src: agent
touches:
  - ".env.example"
  - HANDOFF.md
  - Makefile
  - README.md
  - README.ru.md
  - agent/package.json
  - backend/Dockerfile
  - backend/package-lock.json
  - backend/package.json
  - backend/src/app.module.ts
---

Why: the v1.4.x roadmap still listed backup/restore UI, traffic charts, CSV exports, broader Redis usage and k8s monitoring. How: BackupsModule shells out to pg_dump/psql inside the backend image (postgresql-client added) with strict db-YYYYMMDD-HHMMSS.sql.gz names, BACKUP_DIR/BACKUP_KEEP retention and Compose mounting ./backups to /app/backups so CLI and UI share snapshots; restore needs { confirm: true } and is audit-logged. Reporting adds GET /traffic/chart (daily UTC buckets, byte strings), CSV exports for traffic/audit/payments with a 10 000-row cap and formula-injection escaping in common/csv.ts, plus /traffic with recharts LineChart and Export CSV buttons. Redis throttling implements ThrottlerStorage with ioredis and falls back to a memory Map when REDIS_URL is unset or Redis is down; @nestjs/throttler 5.2.0 exports ThrottlerStorage but NOT ThrottlerStorageRecord, so the record type is declared locally. K8s monitoring is Prometheus+Grafana manifests plus a generator that serializes monitoring/ files as JSON-escaped ConfigMap data (kustomize cannot read files outside its root). Watch out: Next i18n 'en' defines the Dict shape and already had a 'traffic' key - adding it twice breaks next build with TS1117; api.get returns text for text/csv but corrupts binary downloads, so api.download uses a separate blob fetch. Validation: /tmp/opencode/xss-check (backend typecheck/lint/test/build/e2e) and xss-check-fe (lint/build); Node 20.15.1, no Docker/kubectl/Postgres locally.
