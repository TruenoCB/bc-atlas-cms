#!/bin/sh
set -eu

BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$BUILD_ROOT"

IMAGE_NAME=${AIO_IMAGE:-bc-atlas-cms-all-in-one}
IMAGE_TAG=${AIO_TAG:-local}
IMAGE_REF=${1:-${IMAGE_NAME}:${IMAGE_TAG}}
APP_VERSION_VALUE=${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || printf 'dev')}
BASE_IMAGE_REF_VALUE=${BASE_IMAGE_REF:-${BASE_IMAGE:-bc-atlas-cms-base}:${BASE_TAG:-2026.08.12}}
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

if [ "${SKIP_BASE_BUILD:-0}" != "1" ]; then
  "$BUILD_ROOT/scripts/build-base-image.sh" "$BASE_IMAGE_REF_VALUE"
fi

BUILD_ARGS="--build-arg APP_VERSION=$APP_VERSION_VALUE --build-arg BASE_IMAGE_REF=$BASE_IMAGE_REF_VALUE --build-arg NPM_REGISTRY=$NPM_REGISTRY_VALUE --build-arg GOPROXY=$GOPROXY_VALUE"

if [ -n "${PLATFORMS:-}" ]; then
  OUTPUT_FLAG=--load
  if [ "${PUSH:-0}" = "1" ]; then
    OUTPUT_FLAG=--push
  elif printf '%s' "$PLATFORMS" | grep -q ','; then
    printf 'Multi-platform builds require PUSH=1 because Docker cannot load multiple platforms locally.\n' >&2
    exit 1
  fi
  # shellcheck disable=SC2086
  PULL_FLAG=
  if [ "${PUSH:-0}" = "1" ] || [ "${PULL_BASE:-0}" = "1" ]; then
    PULL_FLAG=--pull
  fi
  # shellcheck disable=SC2086
  docker buildx build $PULL_FLAG --platform "$PLATFORMS" "$OUTPUT_FLAG" $BUILD_ARGS -f Dockerfile.all-in-one -t "$IMAGE_REF" .
else
  # shellcheck disable=SC2086
  docker build $BUILD_ARGS -f Dockerfile.all-in-one -t "$IMAGE_REF" .
fi

printf 'Built all-in-one image: %s\n' "$IMAGE_REF"
