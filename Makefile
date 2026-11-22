.PHONY: install up down logs update backup restore monitoring

install:
	bash install.sh

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

monitoring:
	docker compose --profile monitoring up -d prometheus grafana

update:
	git pull && docker compose build && docker compose up -d

backup:
	bash scripts/backup.sh

restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz" >&2; exit 1)
	bash scripts/restore.sh "$(FILE)"