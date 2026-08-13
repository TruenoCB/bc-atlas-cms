#!/bin/sh
set -eu

DEPLOY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-$DEPLOY_ROOT/.env.middleware}
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_ROOT/docker-compose.middleware.yml}
ACTION=${1:-up}

require_env() {
  if [ ! -f "$ENV_FILE" ]; then
    printf '%s does not exist. Run make middleware-init first.\n' "$ENV_FILE" >&2
    exit 66
  fi
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    printf '%s\n' 'A running Docker daemon is required. Start Docker Desktop and retry.' >&2
    exit 1
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_health() {
  container_id=$(compose ps -q middleware)
  attempt=0
  while [ "$attempt" -lt 120 ]; do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id" 2>/dev/null || true)
    if [ "$health" = healthy ]; then
      printf '%s\n' 'MySQL and MinIO are healthy.'
      return
    fi
    if [ "$health" = unhealthy ]; then
      compose logs --tail=160 middleware >&2 || true
      exit 1
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  printf '%s\n' 'Middleware did not become healthy in time.' >&2
  compose logs --tail=160 middleware >&2 || true
  exit 1
}

case "$ACTION" in
  init)
    shift
    "$DEPLOY_ROOT/deploy/init-middleware-env.sh" --output "$ENV_FILE" "$@"
    ;;
  up|start)
    require_env
    load_env
    require_docker
    compose config --quiet
    "$DEPLOY_ROOT/scripts/build-base-image.sh" "${BASE_IMAGE:-bc-atlas-cms-base}:${BASE_TAG:-2026.08.12}"
    compose up -d --no-build --remove-orphans
    wait_for_health
    compose ps
    ;;
  status)
    require_env
    require_docker
    compose ps
    ;;
  logs)
    require_env
    require_docker
    compose logs -f --tail=160 middleware
    ;;
  stop|down)
    require_env
    require_docker
    compose down
    ;;
  *)
    printf 'Usage: %s {init|up|status|logs|down}\n' "$0" >&2
    exit 64
    ;;
esac
