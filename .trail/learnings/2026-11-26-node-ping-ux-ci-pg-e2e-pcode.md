---
title: "Node ping UX, CI pg e2e repair and PR 208"
author: PCode
date: 2026-11-26
branch: ux/panel-2026-11-26
cost: { minutes: 90 }
id: l-aeb09c69
scope: repo
status: active
src: agent
touches:
  - backend/src/modules/config/config-generator.service.ts
  - backend/src/modules/config/agent-client.service.ts
  - backend/test/xray-stats-and-protocols.e2e-pg-spec.ts
  - frontend/src/app/nodes/page.tsx
---

PR #208 (ux/panel-2026-11-26 -> main, merge 7a77ea7): node delete confirmation with audit, 15s polling, compact colour-coded ping, RAM = (total-available)/total, ping failure reason in backend logs (e.g. http agentUrl without ALLOW_HTTP_AGENT_URLS) and health timeout 3->5s. CI initially failed in test/xray-stats-and-protocols.e2e-pg-spec.ts: ConfigGeneratorService gained balancers + dnsProfiles constructor args, test also needed a reverseTunnel.findMany mock; after rebase onto v2.42.1 the spec expected streamSettings.flow, which v2.42.0 removed (flow lives in settings only). Fix all three before merge. In /work proot blocks git object writes: commit in /tmp/opencode/xss-work-fresh, copy .git via tar excluding .proot.l2s.tmp_*, set core.filemode=false, reset --hard in the mirror.
