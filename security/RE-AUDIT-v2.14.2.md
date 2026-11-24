# Security Re-Audit v2.14.2

**Дата**: 2026-11-24
**Ветка**: `review/ux-v213` ← `origin/main` (d244726 = v2.14.2)
**Режим**: read-only (grep по исходникам, headless-браузер не использовался)
**Сравнение**: с `security/AUDIT.md` (v1.8.3, коммит 0ff674b)

---

## 1. HIGH-находки

### 1.1 — Inbounds без tenant isolation
**ПОДТВЕРЖДЕНО ❌ (осталось с v1.8.3)**

`backend/src/modules/inbounds/inbounds.service.ts:10-11`:
```typescript
return this.prisma.inbound.findMany({
  where: nodeId ? { nodeId } : {},
});
```

`findMany` без `orgId` — возвращает подключения **всех** арендаторов.
`findUnique` (строка 23-24) — по `id` без проверки организации.

**Влияние**: OPERATOR другой организации видит все подключения, включая `node.tokenHash`, `realityPrivateKey`.

### 1.2 — SSRF через `base(node, true)` в agent-client
**ПОДТВЕРЖДЕНО ❌ (осталось с v1.8.3)**

`backend/src/modules/config/agent-client.service.ts:25`:
```typescript
private base(node: { address: string; agentUrl?: string | null }, allowPrivate = false) {
  const explicit = node.agentUrl;
  const raw = explicit || process.env.AGENT_BASE_URL || `http://${node.address}:9090`;
```

Используется в `applyConfig` (строка 99), `restart` (109), `installCertificate` (117) с `allowPrivate=true`.

Проблемы:
- `node.address` резолвится без DNS-валидации — SSRF на внутренние сервисы
- Нет блокировки IPv6-адресов
- Нет защиты от DNS-rebinding (адрес может смениться между резолвом и запросом)
- `allowPrivate=true` — прямое обращение к private-IP

### 1.3 — Dev-секреты при unset NODE_ENV
**НУЖНА ПРОВЕРКА**: `NODE_ENV=development` в `.env` (клон в /tmp), но в продакшене Compose/K8s — неизвестно. Не трогал.

### 1.4 — Агент наружу + дефолтный токен
**НУЖНА ПРОВЕРКА**: не проверял docker-compose/K8s манифесты — вне зоны агента 3.

---

## 2. MEDIUM-находки

### 2.1 — OPERATOR сбрасывает пароль ADMIN своей организации
**ПОДТВЕРЖДЕНО ❌ (осталось с v1.8.3)**

`backend/src/modules/users/users.service.ts:137-144`:
```typescript
async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
  await this.findOne(id, actor);
  if (dto.role === Role.ADMIN && actor.role !== Role.ADMIN) {
    throw new ForbiddenException('Only admin can promote to admin');
  }
  // ...
  if (dto.password) data.passwordHash = await this.passwords.hash(dto.password);
```

Защита на строке 139 — только от промоута роли. OPERATOR может передать `dto.password` и сбросить пароль **любого** пользователя своей организации, включая ADMIN.

### 2.2 — /api/metrics без JWT-аутентификации
**Частично исправлено / Осталось**:

`backend/src/modules/metrics/metrics.controller.ts:13-22`:
```typescript
@Get()
async metrics(@Headers('x-metrics-token') token: string, @Res() res: any) {
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const a = Buffer.from(token || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(403).send('Forbidden');
    }
  }
  res.type('text/plain').send(await this.service.render());
}
```

- `GET /metrics` без JWT — токен `METRICS_TOKEN` опционален (если не задан — полный доступ)
- `GET /metrics/view` — защищён `@Roles(Role.ADMIN)` ✅

**Рекомендация**: сделать `METRICS_TOKEN` обязательным.

### 2.3 — Кросс-тенантский `/nodes/:id/traffic`
**ПОДТВЕРЖДЕНО ⚠️ (нужен код-ревью)**

`backend/src/modules/traffic/traffic.controller.ts:14-20`:
```typescript
@Post('nodes/:id/traffic')
report(
  @Param('id') id: string,
  @Body() body: TrafficReportDto,
  @Headers('authorization') auth?: string,
) {
  const token = (auth || '').replace(/^Bearer\s+/i, '');
  return this.service.report(id, body, token);
}
```

Нет `@UseGuards`, нет проверки `organizationId`. `node.tokenHash` из тела запроса — потенциально подделка.

### 2.4 — Сервисы без tenant isolation
**ПОДТВЕРЖДЕНО ❌**

- `hosts.service.ts:14-30` — `findUnique/update/delete` без `orgId`
- `inbounds.service.ts` — см. 1.1

### 2.5 — Не-constant-time сравнения
**НУЖНА ПРОВЕРКА**: не проверял все сравнения — может быть исправлено.

### 2.6 — Токен подписки в URL/логах
**НУЖНА ПРОВЕРКА**: не проверял — вне зоны.

---

## 3. LOW-находки

### 3.1 — .env в дереве
**ИСПРАВЛЕНО ✅**

`git ls-files backend | grep .env` — ничего не вернул. `.env` не закоммичен.

### 3.2 — CORS *.
**НУЖНА ПРОВЕРКА**: не проверял.

---

## 4. Сводная таблица

| # | Уровень | Находка | v1.8.3 | v2.14.2 | Статус |
|---|---------|---------|--------|---------|--------|
| 1.1 | HIGH | Inbounds без tenant isolation | ❌ | ❌ | **не исправлено** |
| 1.2 | HIGH | SSRF agent-client | ❌ | ❌ | **не исправлено** |
| 1.4 | HIGH | Агент наружу / дефолтный токен | ? | ? | не проверял |
| 2.1 | MEDIUM | OPERATOR → ADMIN password reset | ❌ | ❌ | **не исправлено** |
| 2.2 | MEDIUM | /metrics без JWT | ? | частично | token опционален |
| 2.3 | MEDIUM | Кросс-тенант traffic | ? | ❌ | **не исправлено** |
| 2.4 | MEDIUM | Сервисы без tenant isolation | ? | ❌ | **не исправлено** |
| 2.5 | MEDIUM | Не-constant-time сравнения | ? | ? | не проверял |
| 3.1 | LOW | .env в дереве | ? | ✅ | **исправлено** |

---

## 5. Рекомендации

1. **HIGH**: добавить `organizationId` в `findMany`/`findUnique` для всех сервисов (inbounds, hosts, traffic)
2. **HIGH**: DNS-валидация + блокировка IPv6/DNS-rebinding в `agent-client.service.ts`
3. **MEDIUM**: запретить OPERATOR менять пароль ADMIN
4. **MEDIUM**: сделать `METRICS_TOKEN` обязательным
5. **MEDIUM**: добавить JWT-аутентификацию на `POST nodes/:id/traffic`

---

*Аудит read-only. Не трогал код, версии и теги.*
*Связанный отчёт: `docs/reports/ux-review-v2.13.md`*
