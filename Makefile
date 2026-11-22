.PHONY: install up down logs update backup restore

install:
	bash install.sh

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

update:
	git pull && docker compose build && docker compose up -d

backup:
	mkdir -p backups && docker compose exec -T postgres pg_dump -U $$POSTGRES_USER $$POSTGRES_DB > backups/db-$$(date +%F).sql

restore:
	@echo "Usage: make restore FILE=backups/db.sql"; docker compose exec -T postgres psql -U $$POSTGRES_USER $$POSTGRES_DB < $$FILE