#!/bin/sh
set -eu

IMAGE_REF=${1:-${BASE_IMAGE:-bc-atlas-cms-base}:${BASE_TAG:-2026.08.12}}

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  printf 'A running Docker daemon is required to verify %s.\n' "$IMAGE_REF" >&2
  exit 1
fi

docker run --rm --entrypoint bash "$IMAGE_REF" -lc '
  set -euo pipefail
  cat /etc/bc-base-release
  node --version
  npm --version
  go version
  mysqld --version
  minio --version
  test -s /usr/share/licenses/minio/LICENSE
  test -s /usr/share/minio/source.tar.gz
  test -x /usr/local/bin/docker-entrypoint.sh
  test -x /usr/local/bin/bc-middleware-config
  test -x /usr/local/bin/bc-middleware-entrypoint
  test -x /usr/local/bin/bc-middleware-healthcheck
'

printf 'Verified B.C base image: %s\n' "$IMAGE_REF"
