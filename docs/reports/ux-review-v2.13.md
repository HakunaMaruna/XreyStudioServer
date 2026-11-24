# UX Review v2.13+ (v2.14.2)

**Дата**: 2026-11-24
**Стек**: backend :3002 (API docs version 2.14.2), frontend :3003
**Ветка**: `review/ux-v213` ← `origin/main` (d244726 = v2.14.2)
**Режим**: read-only (headless-браузер + grep по исходникам)

---

## 1. Исправление P1 из отчёта v2.8

### A1 — Модалки: role=dialog, aria-modal, focus trap
**ИСПРАВЛЕНО ✅**

Компонент `frontend/src/components/ui.tsx` (строки 381-382):

```tsx
role="dialog"
aria-modal="true"
```

Проверка через DOM (страницы `/inbounds` → кнопка «Новое подключение»):
- `role="dialog"` — ✅
- `aria-modal="true"` — ✅
- `aria-labelledby` ссылается на заголовок — ✅
- focus внутри диалога при открытии — ✅
- **Focus trap на Tab**: реализован (`ui.tsx:353-360`) — Tab переключает фокус между табbable-элементами внутри диалога, зацикливаясь; Escape вызывает `previous?.focus?.()` — ✅
- `inert` на siblings не используется (но focus trap компенсирует)

**Вывод**: A1 закрыт.

### A2 — Фокус перемещается внутрь модалки при открытии
**ИСПРАВЛЕНО ✅**

DOM-проверка подтверждает: при открытии модалки «Новое подключение»
`document.activeElement` находится внутри `[role=dialog]` — ✅

### A3 — label/for связи полей в модалках
**ИСПРАВЛЕНО ✅**

Поля модалки «Новое подключение» (`/inbounds`):

| Поле | label | aria-label |
|------|-------|------------|
| Название | «Название» (label) | — |
| Протокол | «Протокол» (label) | — |
| Порт | «Порт» (label) | — |
| СНИ | «SNI» (label) | — |
| Service name | «Service name» (label) | — |
| Лимит трафика | «Лимит трафикаGB» (label) | — |
| Срок действия | «Срок действия» (label) | — |

Все `input`/`select`/`textarea` имеют `labels.length > 0`.
`unlabeled` массив пуст — ✅

### A4 — Тумблеры без role=switch
**ИСПРАВЛЕНО ✅**

На странице `/inbounds` тумблер «Включено» имеет:
- `role="switch"`
- `aria-checked="true"`
- Текст-обёртка: «Включено»

Находка A4 закрыта.

### A5 — Заголовок страницы и skip-ссылка
**ИСПРАВЛЕНО ✅ (частично ранее)**

- `<title>` теперь: «XreyStudio Control Panel» (был пустой) — ✅
- Skip-ссылка: `<a href="#main-content">Skip to content</a>` присутствует на всех страницах — ✅

### A6 — Поиски без aria-label
**ИСПРАВЛЕНО ✅**

- Глобальный поиск: `aria-label="Поиск страниц..."` — ✅
- Табличный поиск: `aria-label="Поиск"` — ✅

### C1 — Контраст `text-subtle`
**ИСПРАВЛЕНО ✅**

До: `rgb(100,114,138)` на `rgb(8,11,18)` = **4.04:1** (M)
После: `rgb(139,152,172)` на `rgb(8,11,18)` = **~6.7:1** (AA ✅)

---

## 2. Новые страницы: /geodata, /subscription-templates, /health-checks

### 2.1 /geodata — «Геодата-категории»

| Проверка | Результат |
|----------|-----------|
| Skip-ссылка | ✅ `href="#main-content"` |
| `<title>` | «XreyStudio Control Panel» ✅ |
| Табличный поиск | `aria-label="Поиск"` ✅ |
| Модалка «Создать» | `role="dialog"` ✅, `aria-modal="true"` ✅, focus trap ✅, focus inside ✅, `aria-labelledby` ✅ |
| Поля без labels | 0 ✅ |
| role=switch | «Включено» имеет `role="switch"` ✅ |
| Мобильный 390px | Без горизонтального скролла ✅ |
| Мелкие шрифты (< 10px) | 0 ✅ |
| Закрытые кнопки без label | 0 ✅ |

### 2.2 /subscription-templates — «Шаблоны подписок»

| Проверка | Результат |
|----------|-----------|
| Skip-ссылка | ✅ |
| `<title>` | ✅ |
| Модалка «Создать» | `role="dialog"` ✅, `aria-modal="true"` ✅, focus trap ✅, focus inside ✅, `aria-labelledby` ✅ |
| Поля без labels | 0 ✅ |
| role=switch | «Включено» ✅ |
| Мобильный 390px | Без горизонтального скролла ✅ |
| Мелкие шрифты (< 10px) | 0 ✅ |

### 2.3 /health-checks — «Проверки доступа»

| Проверка | Результат |
|----------|-----------|
| Skip-ссылка | ✅ |
| `<title>` | ✅ |
| Табличный поиск | `aria-label="Поиск"` ✅ |
| Фильтр «Все Ноды» (select) | **Не имеет `aria-label`** — ⚠️ N1 |
| Мобильный 390px | Без горизонтального скролла ✅ |
| Мелкие шрифты (< 10px) | 0 ✅ |
| Ошибки сети | Нет ✅ |

---

## 3. Оставшиеся находки

### U1 — `PANEL_URL` при пустом значении (relative /sub/)
**НЕ ИСПРАВЛЕНО ❌**

`backend/src/modules/users/users.service.ts:64`:
```typescript
const base = process.env.PANEL_URL || '';
```
При пустом `PANEL_URL` — относительные URL. Не трогал (не в зоне агента 3).

### U4 — `APP_VERSION` отстаёт от пакетов
**НЕ ИСПРАВЛЕНО ❌**

`frontend/src/lib/version.ts`:
```typescript
export const APP_VERSION = '2.6.1';
```
Пакеты `frontend/package.json` и `backend/package.json`: **2.14.2**.
Версия в коде отстает на ~1.5 года.

### M1 — Скролл таблиц без индикации
**НЕ ИСПРАВЛЕНО ❌**

`frontend/src/components/data-table.tsx:113-114`:
```tsx
<div className="panel overflow-hidden p-0">
  <div className="overflow-x-auto">
```
Визуальная индикация горизонтального скролла не добавлена.

### N1 — Фильтр «Все Ноды» без `aria-label`
**НОВАЯ НАХОДКА ⚠️**

`<select>` на странице `/health-checks` не имеет `aria-label`, `aria-labelledby` или имени. Пользователь без визуального контекста не узнает назначение фильтра.

### M2 — Мелкий шрифт 9px на бейджах навигации
**НОВАЯ НАХОДКА ⚠️**

На дашборде найдено 7 элементов с `font-size: 9px`:
- «Control panel», «Обзор», «Инфраструктура», «Доступ», «Биллинг», «Система», «/»

Это навигационные бейджи/метки. 9px ≈ 6.75pt — ниже рекомендуемого минимума (12px/8pt).

### L1 — Непереведённые строки (латиница)
**НОВАЯ НАХОДКА ℹ️**

Найдены строки на английском:
- «XreyStudio», «Control panel»
- «Backend API»
- «Overview», «Live snapshot of your infrastructure and…»
- «Online», «Offline», «Error»

«Control panel» и «Overview» — скорее всего, статические строки в UI-компонентах, не подключённые к i18n.

---

## 4. Итого

| Категория | Было (v2.8) | Исправлено (v2.14.2) | Осталось |
|-----------|-------------|----------------------|----------|
| A1 — role=dialog/focus trap | ❌ | ✅ | — |
| A2 — фокус внутрь | ❌ | ✅ | — |
| A3 — label/for | ❌ | ✅ | — |
| A4 — role=switch | ❌ | ✅ | — |
| A5 — title/skip-link | ❌ | ✅ | — |
| A6 — aria-label поисков | ❌ | ✅ | — |
| C1 — контраст | ⚠️ 4.04:1 | ✅ ~6.7:1 | — |
| M1 — скролл таблиц | ⚠️ | ❌ | M1 |
| U1 — PANEL_URL | ⚠️ | ❌ | U1 |
| U4 — APP_VERSION | ⚠️ | ❌ | U4 |
| N1 — select aria-label | — | — | N1 |
| M2 — font-size 9px | — | — | M2 |
| L1 — непереведённые строки | — | — | L1 |

**P1 полностью закрыт.** Все 7 пунктов из отчёта v2.8 (A1–A7, C1) исправлены.

---

## 5. Рекомендации

1. **N1** (Low): добавить `aria-label="Фильтр по нодам"` к `<select>` на `/health-checks`
2. **M2** (Medium): увеличить `font-size` бейджей навигации с 9px до минимум 12px
3. **L1** (Low): проверить i18n-ключи для строк «Control panel», «Overview»
4. **U4** (Low): синхронизировать `APP_VERSION` с package.json (2.14.2)

---

*Отчёт подготовлен агентом №3. Не трогал код, версии и теги.*
