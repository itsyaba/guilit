# Gulit — Developer & Operations Makefile
.PHONY: help dev up down restart logs build seed snapshot restore test lint typecheck check-extensions clean prod-up prod-down

SHELL := /bin/bash

# Default target
help:
	@echo "======================================================================"
	@echo "                   Gulit Infrastructure & Ops Commands                "
	@echo "======================================================================"
	@echo "  make dev              Start Postgres container & launch local Next.js dev server"
	@echo "  make up               Build & run all containers (postgres, web, ingest)"
	@echo "  make down             Stop and remove local containers (preserves volumes)"
	@echo "  make restart          Restart all Docker services"
	@echo "  make logs             Stream combined logs from all containers"
	@echo "  make seed             Apply DB migrations and seed initial channels allowlist"
	@echo "  make snapshot         Create a compressed PostgreSQL dump (demo insurance)"
	@echo "  make restore          Restore PostgreSQL from snapshots/latest.sql.gz"
	@echo "  make check-extensions Verify vector, pg_trgm, unaccent extensions in DB"
	@echo "  make test             Run python test suite and next.js typecheck"
	@echo "  make lint             Run ESLint and code formatting check"
	@echo "  make prod-up          Launch production stack with Caddy HTTPS proxy"
	@echo "======================================================================"

# Local development workflow
dev:
	@echo "Starting PostgreSQL database container..."
	@docker compose up -d postgres
	@echo "Starting Next.js development server..."
	@npm run dev

# Docker Compose lifecycle
up:
	@echo "Building and starting all services (postgres, web, ingest)..."
	@docker compose up -d --build

down:
	@echo "Stopping Docker containers..."
	@docker compose down

restart:
	@docker compose restart

logs:
	@docker compose logs -f

build:
	@docker compose build

# Database operations
seed:
	@echo "Pushing Drizzle schema to PostgreSQL..."
	@npm run db:push
	@echo "Seeding initial allowlisted channels..."
	@python -m ingest.cli seed-channels

check-extensions:
	@echo "Checking enabled PostgreSQL extensions..."
	@docker compose exec -T postgres psql -U guilit -d guilit -c "SELECT extname, extversion FROM pg_extension;"

# Snapshot & Restore (Demo insurance)
snapshot:
	@mkdir -p snapshots
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	echo "Creating database snapshot: snapshots/snapshot_$${TIMESTAMP}.sql.gz..."; \
	docker compose exec -T postgres pg_dump -U guilit -d guilit --clean --if-exists | gzip > snapshots/snapshot_$${TIMESTAMP}.sql.gz; \
	cp snapshots/snapshot_$${TIMESTAMP}.sql.gz snapshots/latest.sql.gz; \
	echo "✓ Snapshot saved to snapshots/snapshot_$${TIMESTAMP}.sql.gz and snapshots/latest.sql.gz"

restore:
	@if [ ! -f snapshots/latest.sql.gz ]; then \
		echo "❌ Error: snapshots/latest.sql.gz not found."; \
		echo "Create one first using 'make snapshot' or place your dump in snapshots/latest.sql.gz"; \
		exit 1; \
	fi
	@echo "Restoring database from snapshots/latest.sql.gz..."
	@gunzip -c snapshots/latest.sql.gz | docker compose exec -T postgres psql -U guilit -d guilit
	@echo "✓ Database restored successfully from snapshots/latest.sql.gz"

# Testing & Quality
test:
	@echo "Running Ingest pytest suite..."
	@npm run test:ingest
	@echo "Running TypeScript typecheck..."
	@npm run typecheck

lint:
	@npm run lint

typecheck:
	@npm run typecheck

# Production VPS deployment with Caddy
prod-up:
	@echo "Starting production stack with Caddy automatic HTTPS..."
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

prod-down:
	@docker compose -f docker-compose.yml -f docker-compose.prod.yml down

clean:
	@rm -rf .next build dist .pytest_cache
	@find . -type d -name "__pycache__" -exec rm -rf {} +
