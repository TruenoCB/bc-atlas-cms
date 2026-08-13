#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[bc-all-in-one] %s\n' "$*"
}

require_value() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    printf '[bc-all-in-one] required environment variable %s is empty\n' "$name" >&2
    exit 64
  fi
}

wait_for_mysql() {
  local attempt
  for attempt in {1..90}; do
    if MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping \
      --protocol=tcp --host=127.0.0.1 --user=root --silent >/dev/null 2>&1; then
      log 'MySQL is ready.'
      return 0
    fi
    sleep 2
  done
  printf '[bc-all-in-one] MySQL did not become ready in time\n' >&2
  return 1
}

http_ready() {
  local port=$1
  local path=$2
  local status=''

  exec 3<>"/dev/tcp/127.0.0.1/${port}" || return 1
  printf 'GET %s HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n' "$path" >&3
  IFS= read -r status <&3 || true
  exec 3>&-
  exec 3<&-
  [[ "$status" == *' 200 '* ]]
}

wait_for_minio() {
  local attempt
  for attempt in {1..60}; do
    if http_ready 9000 /minio/health/ready; then
      log 'MinIO is ready.'
      return 0
    fi
    sleep 2
  done
  printf '[bc-all-in-one] MinIO did not become ready in time\n' >&2
  return 1
}

run_unprivileged() {
  if command -v gosu >/dev/null 2>&1; then
    gosu mysql "$@"
  else
    log 'gosu is unavailable; starting this child process as the current user.'
    "$@"
  fi
}

stop_children() {
  local signal=${1:-TERM}
  local pid
  local pids=()
  if [[ "${STOPPING:-0}" == '1' ]]; then
    return
  fi
  STOPPING=1
  trap - TERM INT
  log "Stopping child processes with SIG${signal}."
  for pid in "${APP_PID:-}" "${MINIO_PID:-}" "${MYSQL_PID:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "-${signal}" "$pid" 2>/dev/null || true
      pids+=("$pid")
    fi
  done
  if ((${#pids[@]})); then
    wait "${pids[@]}" 2>/dev/null || true
  fi
}

MYSQL_DATABASE=${MYSQL_DATABASE:-bc_cms}
MYSQL_USER=${MYSQL_USER:-bc}
MINIO_ROOT_USER=${MINIO_ROOT_USER:-bc-minio}
S3_BUCKET=${S3_BUCKET:-bc-content}
DATA_ROOT=${DATA_ROOT:-/data}
HTTP_ADDR=${HTTP_ADDR:-:8080}
WEB_ROOT=${WEB_ROOT:-/app/web}

for variable in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD MINIO_ROOT_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD; do
  require_value "$variable"
done

if [[ "$MYSQL_USER" == 'root' ]]; then
  printf '[bc-all-in-one] MYSQL_USER must be a dedicated application account, not root\n' >&2
  exit 64
fi

mkdir -p "$DATA_ROOT/mysql" "$DATA_ROOT/minio"
chown -R mysql:mysql "$DATA_ROOT/mysql" "$DATA_ROOT/minio"

trap 'stop_children TERM; exit 143' TERM
trap 'stop_children INT; exit 130' INT

log 'Starting MySQL 8.4.'
/usr/local/bin/docker-entrypoint.sh mysqld \
  --datadir="$DATA_ROOT/mysql" \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_0900_ai_ci &
MYSQL_PID=$!
wait_for_mysql

log 'Starting MinIO.'
run_unprivileged /usr/local/bin/minio server "$DATA_ROOT/minio" \
  --address ':9000' --console-address ':9001' &
MINIO_PID=$!
wait_for_minio

export DATABASE_DSN=${DATABASE_DSN:-"${MYSQL_USER}:${MYSQL_PASSWORD}@tcp(127.0.0.1:3306)/${MYSQL_DATABASE}?parseTime=true&charset=utf8mb4&collation=utf8mb4_0900_ai_ci"}
export S3_ENDPOINT=${S3_ENDPOINT:-127.0.0.1:9000}
export S3_ACCESS_KEY=${S3_ACCESS_KEY:-$MINIO_ROOT_USER}
export S3_SECRET_KEY=${S3_SECRET_KEY:-$MINIO_ROOT_PASSWORD}
export S3_BUCKET
export S3_SECURE=${S3_SECURE:-false}
export S3_PUBLIC_URL=${S3_PUBLIC_URL:-/media}
export HTTP_ADDR WEB_ROOT

log 'Starting the B.C application.'
run_unprivileged /app/bc-cms -web "$WEB_ROOT" &
APP_PID=$!

set +e
wait -n "$APP_PID" "$MINIO_PID" "$MYSQL_PID"
EXIT_CODE=$?
set -e
log "A child process exited with status ${EXIT_CODE}; stopping the container."
stop_children TERM
exit "$EXIT_CODE"
