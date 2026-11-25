# Cheburcheck — проверка доступности из России

Кнопка **«Проверить в Cheburcheck»** в разделе «Ноды» запускает внеочередную проверку
адреса ноды: списки блокировок + сетевые сканеры Cheburcheck из российских сетей.
Реализация повторяет идею **Check now** у Mistgate (source «cheburcheck»), но не использует его код.

## Что происходит

1. `GET /check?target=<IP или домен>` — списки, гео, ASN, обратный DNS, жалобы. authorization не нужен.
2. Если получен подписанный `id` и настроен API-токен — `GET /probe/<id>` в потоке SSE;
   читаются события `started`, `result`, `done` (до 45 с, не более 100 результатов).
3. Вердикт: `blocked` (списки), `tspu_block`, `dns_spoofing`, `cdn_block`, `sni_block`,
   `uncertain`, `ok` или `unknown`. Результат сохраняется в `CheburcheckResult`.
4. При вердикте блокировки отправляется уведомление `CHEBURCHECK_BLOCKED`
   (интегрировано с настройками оповещений v2.31.0).

## Как получить токен и где указать

1. Откройте документацию Cheburcheck: <https://cheburcheck.ru/kb/api>.
2. Подайте заявку на токен публичных сканеров: <https://forms.gle/LSPcAV5n3CrdQLMP6>
   (токены выдаёт администратор сервиса; при злоупотреблении их можно отозвать).
3. В панели: **Оповещения → Настройки → Каналы уведомлений**:
   - `Cheburcheck API token` — вставьте полученный токен;
   - `Cheburcheck API URL` — необязательно; пусто означает `https://cheburcheck.ru/api/v1`.
     Укажите свой адрес, если используете собственный/ self-hosted экземпляр API.

То же через API:

```bash
curl -X PATCH https://<панель>/api/notifications/settings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"credentials":{"CHEBURCHECK_API_TOKEN":"<ваш токен>","CHEBURCHECK_BASE_URL":"https://cheburcheck.ru/api/v1"},"policy":{}}'
```

Токен и URL хранятся зашифрованно (AES-256-GCM, `PANEL_MASTER_KEY`), в API и логах
не отображаются; пустое поле означает «оставить текущее значение». Токен уходит только
в заголовке `Authorization: Bearer` на `/probe/<id>` — никогда в URL или публичный бандл.
Свой API URL проверяется: в production только HTTPS, приватные и metadata-адреса запрещены.

`GET /api/cheburcheck/status` показывает доступность сервиса, число записей/адресов в
списках и баланс `credits` (если токен задан). Публичные сканеры работают и при нулевом
балансе; баланс нужен для платных возможностей самого Cheburcheck.

## API панели

- `POST /api/cheburcheck/check { nodeId?, target? }` — полная проверка, результат.
- `GET /api/cheburcheck/results?nodeId&limit` — сохранённые проверки (tenant-scoped).
- `GET /api/reports/cheburcheck?from&to` и `.csv` — отчёт по проверкам.
- Событие `CHEBURCHECK_BLOCKED` добавлено в матрицу уведомлений.

## UI

- «Ноды» → кнопка на строке ноды: модальное окно с анимированным радаром и четырьмя шагами
  (запрос, списки, сканеры, результат), затем карточка цели/гео и список сканеров с region,
  provider, ASN и verdicts.
- «Отчёты» → вкладка «Cheburcheck» с фильтром дат и CSV.

## Ограничения

- cheburcheck видит только IPv4 и PATH до узла (TCP SYN), не сам ответ сервиса: `ok` означает,
  что SYN прошёл через DPI, но не гарантирует, что нода ответила.
- Проверка может занять до 45 секунд; кнопку не нужно нажимать повторно, пока идёт анимация.
- Публичные сканеры — волонтёры, часть ответов может быть `uncertain`; это нормально.
- Результаты сохраняются, но не влияют на автоматический verdict node health — только на
  отчёты и уведомления.
