# Тестовое подключение (проверка реального VPN)

Создано на живой панели `https://msc.h2onetwork.pro` после релиза v2.15.0:
агент теперь запускает настоящий Xray внутри контейнера.

## Данные для импорта

- **Subscription URL** (вставить в приложение как подписку):

  ```text
  https://msc.h2onetwork.pro/sub/2e3897d4-1f8a-4ebc-aba0-3072229d3504
  ```

- **Одиночная ссылка** (если приложение умеет импортировать одну ссылку):

  ```text
  vmess://eyJ2IjoiMiIsInBzIjoidGVzdC12bGVzcy0yMDUzIiwiYWRkIjoiMjEzLjE3MS4zMC4xODYiLCJwb3J0IjoiMjA1MyIsImlkIjoiOWIyZjg3YWMtZTg3ZS00MmM5LTkxYjYtMDFlMzZmYmEzYmRjIiwiYWlkIjoiMCIsInNjeSI6ImF1dG8iLCJuZXQiOiJ0Y3AiLCJ0eXBlIjoibm9uZSIsImhvc3QiOiIiLCJwYXRoIjoiLyIsInRscyI6IiIsInNuaSI6IiJ9
  ```

- Протокол: **VMess**, TCP, port **2053**, без TLS.
- Пользователь: `vpn-test@example.com`, лимит трафика 0 (без ограничения), без срока действия.

## Как добавить

- **v2rayNG / v2rayN**: «Подписка» → «Импорт подписки из буфера» → вставить Subscription URL → обновить.
- **Shadowrocket**: «+» → тип `Subscribe` → вставить URL → Done → выбрать узел `test-vless-2053`.
- **NekoRay / NekoBox**: «Подписка» → «Добавить» → вставить URL → обновить.
- **Xray автоматическая настройка**: можно просто скопировать одиночную `vmess://` ссылку.

## Что уже проверено

Реальный тест с отдельной машины через локальный SOCKS-прокси Xray-клиента:

```text
Прямой IP:               48.102.183.111
IP через туннель:        213.171.30.186   (httpbin.org/get → "origin")
```

То есть трафик действительно выходит через сервер, а не напрямую.

## После проверки

Тестового пользователя и inbound можно удалить из панели:

- **Пользователи** → `vpn-test@example.com` → удалить;
- **Подключения** → `test-vless-2053` → удалить, затем **Ноды → test-node → Применить**.

Если нужно оставить подключение permanently, включите TLS/Reality и ограничьте трафик в карточке пользователя.
