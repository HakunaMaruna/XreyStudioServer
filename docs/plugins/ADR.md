# ADR: Plugin system and App Store

Status: accepted (MVP, 2026-11-25)

## Context

Single repository, NestJS backend, Next.js frontend, PostgreSQL/Prisma, CONTROL/TENANT modes,
existing snapshot subsystem, RBAC ADMIN/OPERATOR/USER, master-to-tenant API tokens.

## Decision 1: tenant catalog access

Options:
1. **Master proxy** — tenant asks master, master asks store.
2. **Direct short-lived token** — master issues a token, tenant calls store directly.
3. Hybrid — proxy for read, direct for artifact download.

Pros/cons:
- Proxy: single policy point, no store keys on tenant; extra hop, master must proxy bytes.
- Direct: less traffic through master; token revocation and policy sync harder.
- Hybrid: efficient, but two trust paths.

**Chosen: master proxy.** Tenant stores only its existing CONTROL token; master enforces
whitelist/blacklist/mandatory plugins and proxies catalog metadata.

## Decision 2: isolation

Options:
1. In-process dynamic import — fast, but a plugin can crash the core and shares all secrets.
2. **Worker process with limits** — separate OS process, JSON-lines IPC, timeout, memory/CPU limits, no DB/env access.
3. Container per plugin — stronger, but heavy deployment and image build per plugin.
4. WASM — strong sandbox, but ecosystem and async I/O are limited for this stack.

**Chosen: worker process for MVP, trusted packages only.** This is a reliability boundary, not
a hostile-code sandbox. Container/WASM is a later stage.

## Decision 3: store deployment

Options:
1. Embed catalog in master — simple, but violates separation and mixes policies with artifacts.
2. **Separate store container + own DB** — independent catalog, REST API, revocation list.
3. External SaaS — out of scope.

**Chosen: separate store container.** It only serves metadata and artifacts; it never executes plugins.

## Decision 4: signatures

Options:
1. Hash only — detects corruption, not forgery.
2. **Ed25519 + SHA-256** — offline verification, public key pinned in master.
3. Full PKI — overkill for MVP.

**Chosen: Ed25519 + SHA-256.** Unsigned plugins allowed only in developer mode with a UI warning.

## Decision 5: snapshots

Options:
1. Separate plugin snapshot format — duplicate logic.
2. **Extend existing SystemSnapshot** — DB dump already contains plugin tables; add plugin manifest and local artifact cache.
3. DB only — cannot restore missing artifacts.

**Chosen: extend existing snapshots**, keep a local cache of plugin versions referenced by snapshots.

## Consequences

- Core remains unchanged for users who do not install plugins.
- Plugin permissions are explicit; no DB or env access is granted.
- Snapshot restore can recover plugin state, but revoked plugins may be marked unavailable if their artifact is not cached.

## Answers and adjusted assumptions (2026-11-25)

- Third-party developers **will** publish plugins. Store moderation is implemented
  (`DRAFT → REVIEW → PUBLISHED → SUSPENDED`) and revocation list is available.
  Signed packages are mandatory in production; unsigned only in dev mode.
- Paid plugins later. Billing/entitlements are deliberately not coupled to this MVP.
- UI slots chosen for MVP: `dashboard.widget`, `settings.section`, `page:<id>`.
  Plugin frontend code is not executed; slots render data returned by the backend.
- Tenant panels are self-hosted at customers, so signatures, revocation and master-mediated
  catalog are mandatory. Tenant never receives store keys.
- Both master and tenant run the same plugin engine; master is the policy source and can
  enforce whitelist/blacklist/mandatory/forced updates.

**Safety note.** The worker process is a reliability boundary (timeouts, memory limit, no
DB/env access, permission-checked SDK), but it is not a hardened sandbox against a malicious
local user. Third-party plugins are accepted only after store moderation. Container/WASM
isolation remains the next security stage.
