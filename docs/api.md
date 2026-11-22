# API Overview

Base path: `/api`

- `POST /auth/login` — login
- `POST /auth/refresh` — refresh token
- `GET /users` — list users
- `POST /users` — create user
- `GET /nodes` — list nodes
- `POST /nodes` — create node
- `GET /nodes/:id/health` — node health
- `GET /subscriptions/:token` — subscription status (format by User-Agent)
- `GET /subscriptions/:token/raw` — raw links
- `GET /subscriptions/:token/base64` — base64 links
- `GET /health` — service health

Swagger UI: `/docs`