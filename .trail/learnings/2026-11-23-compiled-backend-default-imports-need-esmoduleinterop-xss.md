---
title: Compiled backend default imports need esModuleInterop
author: XSS
date: 2026-11-23
branch: main
id: l-77cc3c85
scope: repo
status: active
src: agent
touches:
  - backend/tsconfig.json
  - backend/src/main.ts
  - backend/test/compiled-main.e2e-spec.ts
  - backend/test/app.e2e-spec.ts
  - backend/test/postgres.e2e-pg-spec.ts
  - backend/test/v15.e2e-pg-spec.ts
---

backend/tsconfig.json must set esModuleInterop:true: cookie-parser 1.4.x is CJS (export =), so without it tsc emits require('cookie-parser').default() and node dist/main.js dies with 'cookie_parser_1.default is not a function' (issue #16), while ts-jest e2e still passes. helmet 7 happens to expose .default so it masks the problem. Side effect: every 'import * as request from supertest' in backend/test/*.e2e*-spec.ts must become a default import, because with esModuleInterop the namespace object is not callable. Guard added at backend/test/compiled-main.e2e-spec.ts: it requires the built dist/main.js with NestFactory/Swagger/AppModule mocked and asserts two app.use() calls; verified it fails when the flag is removed. CI runs it via npm run test:e2e after npm run build.
