# Continuum - Makefile
# Quick commands for managing the development environment

.PHONY: help build up down logs ps shell-db clean dev dev-down prod prod-down restart

# Default target
help:
	@echo "Continuum - App State Migration Service"
	@echo ""
	@echo "Available commands:"
	@echo "  make build      - Build all Docker images"
	@echo "  make up         - Start all services (local development)"
	@echo "  make down       - Stop all services (local development)"
	@echo "  make dev        - Start services in development mode (with hot reload)"
	@echo "  make dev-down   - Stop development services"
	@echo "  make prod       - Start all services in production mode"
	@echo "  make prod-down  - Stop production services"
	@echo "  make logs       - View logs from all services"
	@echo "  make logs-api   - View API logs"
	@echo "  make logs-indexer - View indexer logs"
	@echo "  make logs-db    - View MongoDB logs"
	@echo "  make ps         - Show running services"
	@echo "  make shell-db   - Open MongoDB shell"
	@echo "  make restart    - Restart all services"
	@echo "  make clean      - Stop services and remove volumes (WARNING: deletes data)"
	@echo "  make status     - Check sync status via API"
	@echo "  make health     - Health check all services"

# Build all Docker images
build:
	docker-compose build

# Start all services in local development mode
up:
	docker-compose up -d
	@echo "Services starting..."
	@sleep 3
	@make health

# Stop all services (local development)
down:
	docker-compose down

# Start in development mode (with hot reload)
dev:
	docker-compose up -d
	@echo "Development services starting..."
	@sleep 3
	@echo "API available at: http://localhost:3004"
	@echo "MongoDB available at: localhost:27017"

# Stop development services
dev-down:
	docker-compose down

# Start all services in production mode
prod:
	docker-compose -f docker-compose.prod.yml up -d
	@echo "Production services starting..."

# Stop production services
prod-down:
	docker-compose -f docker-compose.prod.yml down

# View all logs
logs:
	docker-compose logs -f

# View API logs
logs-api:
	docker-compose logs -f api

# View indexer logs
logs-indexer:
	docker-compose logs -f indexer

# View MongoDB logs
logs-db:
	docker-compose logs -f mongodb

# Show running services
ps:
	docker-compose ps

# Open MongoDB shell
shell-db:
	docker-compose exec mongodb mongosh -u root -p password

# Restart all services
restart:
	docker-compose restart
	@make health

# Clean everything (WARNING: removes data)
clean:
	@echo "WARNING: This will remove all data including the MongoDB volume!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] && docker-compose down -v || echo "Cancelled"

# Check health of all services
health:
	@echo "Checking service health..."
	@curl -s http://localhost:3004/health && echo " ✓ API is healthy" || echo " ✗ API is not responding"
	@docker-compose ps | grep -q "Up" && echo " ✓ Services are running" || echo " ✗ Some services are down"

# Check sync status via API
status:
	@echo "Checking sync status..."
	@curl -s http://localhost:3004/health | head -20

# View indexer logs in real-time with grep
watch-indexer:
	docker-compose logs -f indexer | grep -E "(Processing|Found|events|block|error|Error)"
