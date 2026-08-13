#!/bin/sh
set -eu

DEPLOY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-$DEPLOY_ROOT/.env}
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_ROOT/docker-compose.yml}
ACTION=${1:-deploy}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import secrets; print(secrets.token_hex(24))'
  else
    printf 'openssl or python3 is required to generate deployment secrets.\n' >&2
    exit 1
  fi
}

initialize_env() {
  if [ -f "$ENV_FILE" ]; then
    printf 'Using existing environment file: %s\n' "$ENV_FILE"
    return
  fi
  umask 077
  MYSQL_PASSWORD_VALUE=$(random_secret)
  MYSQL_ROOT_PASSWORD_VALUE=$(random_secret)
  MINIO_PASSWORD_VALUE=$(random_secret)
  ADMIN_PASSWORD_VALUE=${ADMIN_PASSWORD:-$(random_secret)}
  ADMIN_EMAIL_VALUE=${ADMIN_EMAIL:-owner@localhost}
  cat >"$ENV_FILE" <<EOF
APP_IMAGE=bc-atlas-cms
APP_TAG=local
APP_VERSION=dev
APP_BIND=0.0.0.0
APP_PORT=8080
MYSQL_DATABASE=bc_cms
MYSQL_USER=bc
MYSQL_PASSWORD=$MYSQL_PASSWORD_VALUE
MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD_VALUE
MINIO_ROOT_USER=bc-minio
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD_VALUE
MINIO_IMAGE=minio/minio:RELEASE.2025-06-13T11-33-47Z
MINIO_BIND=127.0.0.1
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_BUCKET=bc-content
PUBLIC_BASE_URL=http://localhost:8080
ADMIN_EMAIL=$ADMIN_EMAIL_VALUE
ADMIN_PASSWORD=$ADMIN_PASSWORD_VALUE
ADMIN_DISPLAY_NAME=B.C
COOKIE_SECURE=false
EOF
  chmod 600 "$ENV_FILE"
  printf 'Created %s with generated secrets.\n' "$ENV_FILE"
  printf 'Initial administrator: %s\n' "$ADMIN_EMAIL_VALUE"
  printf 'Initial administrator password: %s\n' "$ADMIN_PASSWORD_VALUE"
  printf 'Store that password now; later runs reuse the saved environment file.\n'
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker is required for this action.\n' >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    printf 'Docker is installed but its daemon is not running. Start Docker Desktop and retry.\n' >&2
    exit 1
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_health() {
  HEALTH_URL="http://127.0.0.1:${APP_PORT:-8080}/api/health"
  attempt=0
  while [ "$attempt" -lt 90 ]; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      printf 'B.C Atlas CMS is healthy: %s\n' "$HEALTH_URL"
      return
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  printf 'Deployment did not become healthy in time. Recent application logs:\n' >&2
  compose logs --tail=120 app >&2 || true
  exit 1
}

case "$ACTION" in
  init)
    initialize_env
    ;;
  deploy|up)
    initialize_env
    load_env
    require_docker
    compose config --quiet
    compose pull mysql minio
    compose build --pull app
    compose up -d --remove-orphans
    wait_for_health
    compose ps
    ;;
  status)
    initialize_env
    load_env
    require_docker
    compose ps
    ;;
  logs)
    initialize_env
    load_env
    require_docker
    compose logs -f --tail=150 app mysql minio
    ;;
  stop|down)
    initialize_env
    load_env
    require_docker
    compose down
    ;;
  *)
    printf 'Usage: %s {init|deploy|status|logs|stop}\n' "$0" >&2
    exit 2
    ;;
esac
