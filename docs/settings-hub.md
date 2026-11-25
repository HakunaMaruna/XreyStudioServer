# Settings hub

The **Settings** page is the single entry point for configuration that used to be spread
across several pages. It does not duplicate storage: every control calls the same endpoint
as the advanced page, so there is one source of truth.

## What lives where

| Area | Where it is edited | API |
| --- | --- | --- |
| Language, theme, compact mode, panel behaviour | Settings → Appearance / Panel behavior | browser `localStorage` (`xss_settings`) |
| Notification policy (enabled, channels, quiet hours, cooldown, severity, escalation) | Settings → Notifications, or Alerts → Settings | `GET/PATCH /api/notifications/settings` |
| Backup schedule, retention, on/off | Settings → Backups, or Backups → Schedule | `GET/PATCH /api/backups/settings` |
| Channel credentials and alert routing | Alerts / Routing (advanced, secrets stay there) | `/api/notifications/*`, `/api/routing/*` |
| PowerDNS mode, zones and records (CONTROL mode only) | Settings → Quick links → DNS, or the DNS page | `/api/dns/*` |
| Telegram bot token, subscription templates, API tokens, node diagnostics | linked from Settings → Quick links | their own modules |

The hub intentionally does **not** show secrets. `GET /api/notifications/settings` returns
only booleans for configured credentials, and the environment table filters keys containing
`TOKEN`, `SECRET`, `PASSWORD`, `KEY` or `WEBHOOK`. Credentials and webhook URLs remain on the
Alerts page where they can be managed with the existing authorization and audit trail.

## Why these settings were moved

Other Xray panels (Remnawave, 3x-ui, Mistgate) keep notification channels, scheduled backups
and subscription defaults close to a central "Settings" screen. Our previous layout forced an
operator to visit three unrelated pages to answer simple questions: "are backups on?", "which
channels send alerts?", "where do I change cooldown?". The hub answers those questions in one
view while keeping the advanced editors in their original pages.

The DNS quick link appears only when `GET /api/dns/status` reports `mode: control`; tenant
installations keep the same settings page without a dead link. See [powerdns.md](powerdns.md)
for the Control-plane deployment details.

Only ADMIN/OPERATOR sessions see the hub; local appearance settings remain available to every
authenticated user. The hub loads through the same JWT-aware API client, so a missing or expired
token produces a clear error instead of silently showing empty configuration.

## Validation and edge cases

- Cooldown is clamped to 0–1440 minutes and retention to 1–365 days in the UI; the backend DTO
  applies its own validation, so crafted requests cannot bypass it.
- An empty Telegram/webhook/email channel is shown as "Not configured" — no token value is
  rendered, only its presence.
- When a request fails, the error message is displayed and the previous values stay untouched.
- The environment table is limited to eight safe keys to keep the page readable.
