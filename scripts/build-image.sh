#!/bin/sh
set -eu

BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$BUILD_ROOT"

IMAGE_NAME=${APP_IMAGE:-bc-atlas-cms}
IMAGE_TAG=${APP_TAG:-local}
IMAGE_REF=${1:-${IMAGE_NAME}:${IMAGE_TAG}}
APP_VERSION_VALUE=${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || printf 'dev')}
NPM_REGISTRY_VALUE=${NPM_REGISTRY:-https://registry.npmjs.org/}
GOPROXY_VALUE=${GOPROXY:-https://proxy.golang.org,direct}

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required to build %s.\n' "$IMAGE_REF" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Docker is installed but its daemon is not running. Start Docker Desktop and retry.\n' >&2
  exit 1
fi

if [ -n "${PLATFORMS:-}" ]; then
  OUTPUT_FLAG=--load
  if [ "${PUSH:-0}" = "1" ]; then
    OUTPUT_FLAG=--push
  elif printf '%s' "$PLATFORMS" | grep -q ','; then
    printf 'Multi-platform builds require PUSH=1 because Docker cannot load multiple platforms locally.\n' >&2
    exit 1
  fi
  docker buildx build --platform "$PLATFORMS" "$OUTPUT_FLAG" --build-arg "APP_VERSION=$APP_VERSION_VALUE" --build-arg "NPM_REGISTRY=$NPM_REGISTRY_VALUE" --build-arg "GOPROXY=$GOPROXY_VALUE" -t "$IMAGE_REF" .
else
  docker build --pull --build-arg "APP_VERSION=$APP_VERSION_VALUE" --build-arg "NPM_REGISTRY=$NPM_REGISTRY_VALUE" --build-arg "GOPROXY=$GOPROXY_VALUE" -t "$IMAGE_REF" .
fi

printf 'Built application image: %s\n' "$IMAGE_REF"
