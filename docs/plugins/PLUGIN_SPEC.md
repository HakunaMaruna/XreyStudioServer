# Plugin specification (v1)

## Manifest: `plugin.json`

```json
{
  "id": "com.example.mywidget",
  "name": "My widget",
  "version": "1.0.0",
  "author": "Example",
  "description": "Short description",
  "license": "MIT",
  "minPanelVersion": "2.38.0",
  "maxPanelVersion": null,
  "dependencies": [],
  "permissions": ["users:read"],
  "entrypoints": { "backend": "backend/index.js", "frontend": null, "migrations": "migrations" },
  "hooks": ["onEnable", "onDisable"],
  "settingsSchema": { "type": "object", "properties": {} },
  "healthcheck": "health",
  "i18n": { "ru": { "title": "Мой виджет" }, "en": { "title": "My widget" } }
}
```

- `id`: reverse-domain, `^[a-z0-9]+(\.[a-z0-9-]+)+$`.
- `version`: SemVer.
- `permissions`: declarative allowlist. Anything not declared is denied.
- `settingsSchema`: JSON Schema used to generate the admin form.

## Archive

```text
plugin.json
backend/
frontend/
migrations/up.sql
migrations/down.sql
assets/
README.md
CHANGELOG.md
signature.json  # { "algorithm":"Ed25519","signature":"base64","sha256":"hex" }
```

## Lifecycle

install → enable → update → disable → uninstall. Hooks: `onInstall`, `onEnable`, `onDisable`,
`onUpdate`, `onUninstall`. Hooks are idempotent and have a 10s timeout.

## SDK

Plugins use `@xss/plugin-sdk` only. They receive an IPC client with:
`events.on/emit`, `storage.get/set/delete`, `settings.get`, `log`, `http.request` (SSRF-filtered),
`api.call` (permission-checked). Direct Prisma/import of core modules is forbidden.

## UI slots

`dashboard.widget`, `settings.section`, `page:<id>`.

## Health and circuit breaker

A plugin with error rate above threshold or failed healthcheck is moved to `disabled`/`quarantined`,
its routes and slots are hidden, and an alert is emitted. Recent changes are auto-disabled in
safe mode. Updates have a trial period with automatic rollback.
