.PHONY: dev api build test image base-image base-image-verify middleware-init middleware-up middleware-status middleware-logs middleware-down init deploy up status down logs all-in-one-image all-in-one-init all-in-one-deploy all-in-one-up all-in-one-status all-in-one-down all-in-one-logs

dev:
	npm run dev -- --host 0.0.0.0 --port 4173 --strictPort

api:
	go run ./server/cmd/api -addr :8080

build:
	npm run build
	mkdir -p bin
	go build -trimpath -o bin/bc-atlas-api ./server/cmd/api

test:
	npm run test:sites
	go test ./...

image:
	./scripts/build-image.sh

base-image:
	./scripts/build-base-image.sh

base-image-verify:
	./scripts/verify-base-image.sh

middleware-init:
	./scripts/middleware.sh init

middleware-up:
	./scripts/middleware.sh up

middleware-status:
	./scripts/middleware.sh status

middleware-logs:
	./scripts/middleware.sh logs

middleware-down:
	./scripts/middleware.sh down

init:
	./scripts/deploy.sh init

deploy:
	./scripts/deploy.sh deploy

up: deploy

status:
	./scripts/deploy.sh status

down:
	./scripts/deploy.sh stop

logs:
	./scripts/deploy.sh logs

all-in-one-image:
	./scripts/build-all-in-one-image.sh

all-in-one-init:
	./scripts/deploy-all-in-one.sh init

all-in-one-deploy:
	./scripts/deploy-all-in-one.sh deploy

all-in-one-up: all-in-one-deploy

all-in-one-status:
	./scripts/deploy-all-in-one.sh status

all-in-one-down:
	./scripts/deploy-all-in-one.sh stop

all-in-one-logs:
	./scripts/deploy-all-in-one.sh logs
