# Operator UI guide

This guide walks through the screens an operator sees and what each step accomplishes. Screenshots
were captured from the AdminLTE default UI; Aurora remains available with `NEXT_PUBLIC_UI=aurora`.

## Sign in

![Login screen](screenshots/login.png)

1. Open `https://<your-domain>/login`.
2. Enter the administrator email and password created during installation.
3. On success the dashboard opens. On failure the page shows a generic message; check the backend
   logs rather than trying repeatedly, because repeated failures are rate-limited.
4. If `PANEL_DECOY=true`, the public address shows the neutral placeholder below. Reach the panel
   through the secret entry (`/<PANEL_ENTRY_PATH>/login`) or, after a successful login, via the
   routing cookie set by the middleware.

![Decoy screen](screenshots/decoy.png)

## Public documentation

Documentation is published at `/docs` without authentication. It is server-rendered, linked from
`sitemap.xml` and described in `robots.txt`. Private pages are marked `noindex`, so search engines
see only public product information and never a session-specific subscription link.

![Public docs screen](screenshots/public-docs.png)

## Daily workflow

| Screen | What you do | Result |
| --- | --- | --- |
| **Dashboard** | Check active users, traffic and recent events | Fast health overview |
| **Nodes** | Add a node, copy its token once, watch status | Agent connects and receives configs |
| **Inbounds** | Define ports and protocols | Users can connect |
| **Config profiles** | Bind a profile to a node | Traffic for that profile goes to that node |
| **Users / Plans** | Create a user, assign a plan and `deviceLimit` | Subscription link becomes active |
| **Traffic** | Filter by period and node | Usage reports and billing data |
| **Health checks** | Review failed probes | Notifications routed by event rules |
| **Doctor** | Run diagnostics, fix only whitelisted `stale_revision` | Config stays consistent |
| **Backups** | Create, list and restore encrypted snapshots | Recovery point is available |

## Adding a user with a device limit

1. Open **Plans** and create a plan with the allowed traffic and `deviceLimit`.
2. Open **Users**, create the user, select the plan and copy the `/sub/<token>` link.
3. Ask the user to open the link in the VPN client. The client registers its HWID through
   `/api/devices/bind`. Once `deviceLimit` is reached, the UI shows a clear 403 message and further
   bind attempts receive 429.
4. To free a slot, open the user's **Devices** list and delete the stale device.

## Bulk user membership and Telegram id

1. Open **Users** and tick the users you want to manage. The toolbar shows how many are selected.
2. Choose **Add selected** or **Remove selected** and pick a connection. To apply to everyone,
   choose **Add all** — the server computes the target list, so no huge id array is sent.
   **By group** applies the operation to every member of a user group.
3. The result reports how many clients were affected and how many were already in the requested
   state. Repeating an add is safe: existing memberships are skipped.

The **Telegram ID** field on create/edit accepts a numeric id (5–12 digits). On the user card
and in the group member list an external-link button opens `https://t.me/<id>` in a new tab.
Use this only for ids you trust; the link is built from validated digits and never from arbitrary
input. The bot's `/login bind` flow links the same field after validating the id with Telegram.

## Creating an encrypted backup

1. Set `BACKUP_ENCRYPTION_KEY` in `.env` before enabling a bucket. Without it, S3 uploads are
   refused so plaintext data cannot leave the host.
2. Open **Backups** and click **Create**. The file appears as `<timestamp>.sql.gz.enc`.
3. If S3 is configured, confirm the object appears in the bucket with the same size.
4. Restore only from **Backups** with the confirmation step, or use `scripts/restore.sh` from the
   host console. The GCM tag is verified before any SQL is applied.
5. Follow [runbooks/backup-restore-drill.md](runbooks/backup-restore-drill.md) for a quarterly drill.

## Settings hub

Open **Settings** for a single view of panel configuration. Administrators see notification
policy and active channels, the backup schedule and retention, integration status and quick
links to advanced editors (Alerts, Routing, Subscription templates, API tokens, Backups,
Doctor, and DNS in CONTROL mode). Changing a policy or schedule there calls the same API as the dedicated page, so the
values stay in sync. Secret values are never shown — only whether a channel is configured.

Local appearance options (language, theme, compact mode) and panel behaviour toggles are saved
in the browser and apply to the current device. See [settings-hub.md](settings-hub.md) for the
full mapping of settings to endpoints and the rationale.

## Troubleshooting quick reference

- **Node offline** → verify the token, panel URL and firewall; see
  [runbooks/incident-node-offline.md](runbooks/incident-node-offline.md).
- **Subscription shows empty config** → check that a plan and inbound exist, then open the link
  with `?format=json` to bypass User-Agent detection.
- **Doctor warns about a stale revision** → confirm the node is online, then use the fix action.
- **No admin can sign in** → use the Rescue CLI; see [processes.md](processes.md#6-recovery-tools).
