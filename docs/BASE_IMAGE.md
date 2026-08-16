# Reproducible middleware and toolchain base image

## Contents

`Dockerfile.base` creates one reusable parent image containing:

| Component | Pinned input | Purpose |
| --- | --- | --- |
| MySQL | official `mysql:8.4` image | Runtime database and official initialization entrypoint |
| Node.js + npm | `node:24.18.1-bookworm-slim` | React/Vite dependency installation and production builds |
| Go | `golang:1.24.8-bookworm` | B.C API builds and the exact MinIO source toolchain |
| MinIO | source commit `7aac2a2c5b7c882e68c1ce017d8256be2feea27f` | S3-compatible object storage, compiled with `CGO_ENABLED=0` |
| Build utilities | Git, make, GCC/G++, Python, tar | Native npm modules and general build work |

This is intentionally a large builder/runtime base. Its job is to make rebuilding the B.C all-in-one image fast and reproducible on one host. The ordinary `Dockerfile` remains the smaller production application image for the recommended three-container topology.

The MinIO community repository is archived and its final source declares Go 1.24 with a `go1.24.8` toolchain. The base image verifies that declaration before compiling. The build also stores:

```text
/usr/local/bin/minio
/usr/share/licenses/minio/LICENSE
/usr/share/minio/source.tar.gz
/etc/bc-base-release
/usr/local/bin/bc-middleware-config
/usr/local/bin/bc-middleware-entrypoint
```

Keeping the source archive in the distributed image makes the exact AGPL-covered source corresponding to the binary available to operators. It does not replace your responsibility to retain license notices and satisfy the licenses of redistributed dependencies.

## Configure accounts and run the middleware image

The base image can run MySQL and MinIO together without the B.C application. Credentials belong in a private runtime environment file, never in the image or Git repository.

Create that file interactively from the project directory:

```bash
make middleware-init
```

The prompt asks for:

- MySQL database name
- dedicated MySQL application user and password
- MySQL root password
- MinIO root user and password

Password input is hidden and confirmed. Values must be at least 12 characters, the file is created as `.env.middleware` with mode `0600`, and `.gitignore` plus `.dockerignore` exclude it.

For CI or another non-interactive shell, supply secrets through the process environment rather than command-line arguments:

```bash
MYSQL_DATABASE=bc_cms \
MYSQL_USER=bc \
MYSQL_PASSWORD="$PRIVATE_MYSQL_PASSWORD" \
MYSQL_ROOT_PASSWORD="$PRIVATE_MYSQL_ROOT_PASSWORD" \
MINIO_ROOT_USER=bc-minio \
MINIO_ROOT_PASSWORD="$PRIVATE_MINIO_PASSWORD" \
./deploy/init-middleware-env.sh --output .env.middleware
```

Do not type literal passwords into a shared command or commit that example as a script. Secret-manager environment injection is preferred in CI.

Build the base and start both services:

```bash
make middleware-up
```

The resulting listeners are private by default:

```text
MySQL       127.0.0.1:3306
MinIO API   127.0.0.1:9000
MinIO UI    127.0.0.1:9001
```

Change the host ports in `.env.middleware` when necessary. The container stores MySQL data under `/data/mysql` and MinIO objects under `/data/minio` in the `bc-atlas-cms-middleware_middleware-data` named volume.

Operations:

```bash
make middleware-status
make middleware-logs
make middleware-down
```

`middleware-down` keeps the named data volume. Once the volume has been initialized, editing a password in `.env.middleware` alone does not rotate the credential stored inside MySQL or MinIO.

You can also use the configuration utility packaged inside the image. Mount a private host directory so the generated file survives the temporary container:

```bash
mkdir -p private-config
chmod 700 private-config
docker run --rm -it \
  --entrypoint bc-middleware-config \
  -v "$PWD/private-config:/config" \
  bc-atlas-cms-base:2026.08.12 \
  --output /config/.env.middleware
```

## Build it locally

Start Docker Desktop or Docker Engine, then run:

```bash
make base-image
```

Equivalent explicit command:

```bash
BASE_IMAGE=bc-atlas-cms-base \
BASE_TAG=2026.08.12 \
./scripts/build-base-image.sh
```

The build script compiles MinIO from source, tags the result as `bc-atlas-cms-base:2026.08.12`, and runs a smoke test for Node, npm, Go, MySQL, MinIO, the source archive, license, and official MySQL entrypoint.

BuildKit keeps the Go module and compiler caches between retries. If the default Go module proxy is slow or unreliable on the build host, select a reachable mirror without changing the pinned MinIO source revision:

```bash
MINIO_GOPROXY=https://goproxy.cn,direct make base-image
```

Verify an existing image separately:

```bash
./scripts/verify-base-image.sh bc-atlas-cms-base:2026.08.12
```

Inspect the pinned build record:

```bash
docker run --rm --entrypoint cat \
  bc-atlas-cms-base:2026.08.12 \
  /etc/bc-base-release
```

## Build the B.C all-in-one image from it

```bash
make all-in-one-image
```

`build-all-in-one-image.sh` builds and verifies the base first unless `SKIP_BASE_BUILD=1` is set. `Dockerfile.all-in-one` then uses the same base for both frontend and Go build stages and as the final MySQL/MinIO runtime.

If the base already exists locally:

```bash
SKIP_BASE_BUILD=1 \
BASE_IMAGE=bc-atlas-cms-base \
BASE_TAG=2026.08.12 \
make all-in-one-image
```

The normal deployment command also builds the base automatically:

```bash
make all-in-one-deploy
```

## Publish multi-architecture images

Use registry-qualified image names. The first command publishes the parent manifest; the second builds the B.C image against that registry parent:

```bash
BASE_IMAGE=registry.example/bc-atlas-cms-base \
BASE_TAG=2026.08.12 \
PLATFORMS=linux/amd64,linux/arm64 \
PUSH=1 \
./scripts/build-base-image.sh

BASE_IMAGE=registry.example/bc-atlas-cms-base \
BASE_TAG=2026.08.12 \
AIO_IMAGE=registry.example/bc-atlas-cms-all-in-one \
AIO_TAG=2026.08.12 \
PLATFORMS=linux/amd64,linux/arm64 \
PUSH=1 \
SKIP_BASE_BUILD=1 \
PULL_BASE=1 \
./scripts/build-all-in-one-image.sh
```

The MinIO compile stage runs on the builder platform and cross-compiles with BuildKit's target OS/architecture values. The Node, Go, and MySQL layers are still selected for each target architecture.

## Updating versions safely

Do not change only a floating tag. Update the following together:

1. immutable MinIO commit in `Dockerfile.base`, `.env.all-in-one.example`, and `deploy-all-in-one.sh`
2. `GO_IMAGE` to the toolchain declared by that MinIO commit's `go.mod`
3. `NODE_IMAGE` to a fixed supported Node release
4. `BASE_TAG` so existing deployments are not silently mutated
5. build and smoke-test both `linux/amd64` and `linux/arm64`
6. rebuild the all-in-one child and run application tests

An immutable registry digest can be used instead of a tag for stronger supply-chain reproducibility. Version tags here remain readable defaults, while the MinIO source itself is pinned to a full Git commit and verified during the build.
