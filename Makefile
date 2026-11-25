.PHONY: install up down logs update backup restore monitoring k8s-monitoring \
        snapshot-create snapshot-list snapshot-policy snapshot-restore snapshot-delete

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

k8s-monitoring:
	node k8s/generate-monitoring.mjs

COMPOSE_CMD := $(shell if grep -q '^PANEL_MODE=control' .env 2>/dev/null; then echo 'docker compose -f docker-compose.control.yml'; else echo 'docker compose'; fi)

update:
	@test -z "$$(git status --porcelain)" || { echo "refusing update: working tree has uncommitted changes" >&2; exit 1; }
	branch=$$(git symbolic-ref -q --short HEAD || git for-each-ref --format='%(refname:short)' refs/heads | head -n 1); \
	git checkout -q "$${branch:-main}" && git pull --ff-only && $(COMPOSE_CMD) build && $(COMPOSE_CMD) up -d

backup:
	bash scripts/backup.sh

restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/db-YYYYMMDD-HHMMSS.sql.gz" >&2; exit 1)
	bash scripts/restore.sh "$(FILE)"

# System snapshots CLI. Pass LABEL, REASON, ID, CONFIRM and DRY_RUN as make variables.
snapshot-create:
	@LABEL="$(LABEL)" REASON="$(REASON)" SCOPE="$(SCOPE)" ID="$(ID)" CONFIRM="$(CONFIRM)" DRY_RUN="$(DRY_RUN)" OFFLINE="$(OFFLINE)" COMPONENTS="$(COMPONENTS)" sh scripts/snapshot.sh create

snapshot-list:
	@LABEL="$(LABEL)" REASON="$(REASON)" SCOPE="$(SCOPE)" ID="$(ID)" CONFIRM="$(CONFIRM)" DRY_RUN="$(DRY_RUN)" OFFLINE="$(OFFLINE)" COMPONENTS="$(COMPONENTS)" sh scripts/snapshot.sh list

snapshot-policy:
	@LABEL="$(LABEL)" REASON="$(REASON)" SCOPE="$(SCOPE)" ID="$(ID)" CONFIRM="$(CONFIRM)" DRY_RUN="$(DRY_RUN)" OFFLINE="$(OFFLINE)" COMPONENTS="$(COMPONENTS)" sh scripts/snapshot.sh policy

snapshot-restore:
	@LABEL="$(LABEL)" REASON="$(REASON)" SCOPE="$(SCOPE)" ID="$(ID)" CONFIRM="$(CONFIRM)" DRY_RUN="$(DRY_RUN)" OFFLINE="$(OFFLINE)" COMPONENTS="$(COMPONENTS)" sh scripts/snapshot.sh restore "$(ID)"

snapshot-delete:
	@LABEL="$(LABEL)" REASON="$(REASON)" SCOPE="$(SCOPE)" ID="$(ID)" CONFIRM="$(CONFIRM)" DRY_RUN="$(DRY_RUN)" OFFLINE="$(OFFLINE)" COMPONENTS="$(COMPONENTS)" sh scripts/snapshot.sh delete "$(ID)"
