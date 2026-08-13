#!/bin/sh
set -eu

BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$BUILD_ROOT"

IMAGE_NAME=${BASE_IMAGE:-bc-atlas-cms-base}
IMAGE_TAG=${BASE_TAG:-2026.08.12}
IMAGE_REF=${1:-${IMAGE_NAME}:${IMAGE_TAG}}
BASE_VERSION_VALUE=${BASE_VERSION:-$IMAGE_TAG}
MYSQL_IMAGE_VALUE=${MYSQL_IMAGE:-mysql:8.4}
NODE_IMAGE_VALUE=${NODE_IMAGE:-node:24.18.1-bookworm-slim}
GO_IMAGE_VALUE=${GO_IMAGE:-golang:1.24.8-bookworm}
MINIO_SOURCE_REPOSITORY_VALUE=${MINIO_SOURCE_REPOSITORY:-https://github.com/minio/minio.git}
MINIO_SOURCE_REF_VALUE=${MINIO_SOURCE_REF:-7aac2a2c5b7c882e68c1ce017d8256be2feea27f}

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required to build %s.\n' "$IMAGE_REF" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Docker is installed but its daemon is not running. Start Docker Desktop and retry.\n' >&2
  exit 1
fi

set -- \
  --build-arg "BASE_VERSION=$BASE_VERSION_VALUE" \
  --build-arg "MYSQL_IMAGE=$MYSQL_IMAGE_VALUE" \
  --build-arg "NODE_IMAGE=$NODE_IMAGE_VALUE" \
  --build-arg "GO_IMAGE=$GO_IMAGE_VALUE" \
  --build-arg "MINIO_SOURCE_REPOSITORY=$MINIO_SOURCE_REPOSITORY_VALUE" \
  --build-arg "MINIO_SOURCE_REF=$MINIO_SOURCE_REF_VALUE"

if [ "${NO_CACHE:-0}" = "1" ]; then
  set -- "$@" --no-cache
fi

if [ -n "${PLATFORMS:-}" ]; then
  OUTPUT_FLAG=--load
  if [ "${PUSH:-0}" = "1" ]; then
    OUTPUT_FLAG=--push
  elif printf '%s' "$PLATFORMS" | grep -q ','; then
    printf 'Multi-platform builds require PUSH=1 because Docker cannot load multiple platforms locally.\n' >&2
    exit 1
  fi
  docker buildx build --pull --platform "$PLATFORMS" "$OUTPUT_FLAG" \
    "$@" -f Dockerfile.base -t "$IMAGE_REF" .
else
  docker build --pull "$@" -f Dockerfile.base -t "$IMAGE_REF" .
fi

printf 'Built B.C base image: %s\n' "$IMAGE_REF"
if [ "${PUSH:-0}" != "1" ]; then
  "$BUILD_ROOT/scripts/verify-base-image.sh" "$IMAGE_REF"
fi
