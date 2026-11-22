---
title: "v1.4.x traffic quotas, node logs, admin UI"
author: XSS
date: 2026-11-22
branch: main
id: l-734389e4
scope: repo
status: active
src: agent
touches:
  - backend/src/modules/traffic/traffic.service.ts
  - backend/src/modules/subscriptions/subscriptions.service.ts
  - backend/src/modules/payments/payments.service.ts
  - frontend/src/app/audit/page.tsx
  - HANDOFF.md
---

Why: the panel had no per-user accounting, no log access and no UI for audit/orgs/payments/plans. v1.4.0 added UserTraffic + TrafficModule: POST /nodes/:id/traffic (node token) stores entries, increments User.trafficUsed and sets EXPIRED at the limit; GET /traffic exposes history. Agent GET /logs uses journalctl with XRAY_LOG_PATH/SINGBOX_LOG_PATH fallback; panel proxies GET /nodes/:id/logs. Payment.planId activates users on markPaid; PATCH /payments/plans/:id toggles plans. New pages: /audit, /organizations, /payments, /plans plus inbound edit modal. Watch out: SubscriptionsService.getStatus must check the quota before status===EXPIRED, otherwise it returns 'expired' instead of 'exceeded' and the real-PostgreSQL e2e fails (v1.4.1 hotfix). Validation in /tmp/opencode/xss-check and xss-check-fe; CI's PostgreSQL 16 service is authoritative because the local sandbox cannot run Postgres (shmget unavailable).
