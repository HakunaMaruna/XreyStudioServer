# Roadmap — ideas from other Xray panels

Shared task board for all code agents. Status: **planned** unless marked done.
Ideas are independently implemented; no code is copied from the source panels
(remnawave/panel, 3x-ui, lucx-ui, Mistgate are copyleft licensed).

## Task board

| # | Task | Source idea | Status | Notes |
|---|------|-------------|--------|-------|
| 1 | Device/HWID limit with per-user cap, device list and revoke | remnawave, lucx-ui, Mistgate | **done (verified + documented)** | `Device` model, `deviceLimit`, subscription `?hwid=`, Devices UI, e2e `devices.e2e-pg-spec.ts`; README EN/RU + `docs/test-connection.md`. |
| 2 | Decoy page + hidden admin entry (secret path) | Mistgate | **done** | `PANEL_DECOY`, `PANEL_ENTRY_PATH`, `/decoy`, routing-only cookie on login (auth still JWT). |
| 3 | Per-user subscription landing page (QR, instructions, traffic/expiry) | Mistgate | **done** | HTML page at `/sub/<token>` with QR, instructions, traffic/expiry; browser HWID binding + `?hwid=` on every fetch; 403/429 shows device-limit message. Optional subscription password — separate follow-up (needs schema + client support). |
| 4 | Per-node/per-outbound traffic and reusable connection profiles | 3x-ui, Mistgate | **partial** | ConfigProfile.nodeId binding + `/api/metrics/traffic/nodes` (per-node traffic from UserTraffic) + UI. Per-outbound breakdown needs agent-side tag collection — follow-up. |
| 5 | Add node over SSH from UI with client certificate provisioning | Mistgate | **partial** | SSH provisioning endpoint + UI (strict host-key fingerprint, secrets never stored, `SSH_PROVISION_ENABLED=false` by default). Token auth is used; mTLS client certificates remain a follow-up. |
| 6 | Host doctor checks and safe auto-fixes | Mistgate | planned | Extend existing health-checks. |
| 7 | Signed panel/agent updates (Ed25519) | Mistgate | planned | CI can sign releases. |
| 8 | Encrypted scheduled backups to S3/R2 | Mistgate, 3x-ui | planned | Existing `backup.sh` + scheduler are the base. |
| 9 | Subscription format selection by User-Agent (Happ/Mihomo/sing-box/list) | lucx-ui, Mistgate | partially implemented | Formats exist; UA-based landing/profile choice missing. |
| 10 | Telegram bot commands + OAuth login | remnawave | planned | Telegram currently notifications-only. |
| 11 | Rescue CLI for password/admin recovery | remnawave | planned | Avoid raw DB edits. |
| 12 | MCP write-plan with owner approval | Mistgate | planned | MCP currently read-only; keep strict consent + audit. |

## Rules for agents

- Work one task at a time. Mark status in this file, document changes in `docs/api.md` /
  `README.md` where user-facing, commit and push after each completed task.
- Keep changes independent; do not copy source-panel code, only implement the idea.
- Never weaken auth, validation or TLS to make a feature work.
