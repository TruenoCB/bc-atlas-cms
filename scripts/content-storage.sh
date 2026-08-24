#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-$ROOT/.env}
MODE=${1:-migrate}

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing %s. Set ENV_FILE or initialize the deployment first.\n' "$ENV_FILE" >&2
  exit 66
fi

case "$MODE" in
  migrate|reindex|verify) ;;
  *)
    printf 'Usage: %s {migrate|reindex|verify}\n' "$0" >&2
    exit 64
    ;;
esac

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cd "$ROOT"
if [ -x /app/bc-content-storage ]; then
  exec /app/bc-content-storage -mode "$MODE"
fi
exec go run ./server/cmd/content-storage -mode "$MODE"
