# All-in-one container deployment

## When to use it

The all-in-one image runs the B.C Go application, MySQL 8.4, and source-built MinIO in one container. It derives from the reusable [middleware and toolchain base image](BASE_IMAGE.md), which also includes Node/npm and Go for reproducible application builds. MinIO source compilation provides an auditable, reproducible binary but does not create ongoing security maintenance for its now-archived community repository. This layout is intended for a personal server, NAS, home lab, demo host, or a tunnel-backed single-node deployment where portability matters more than independent scaling.

The existing three-container Compose stack remains the recommended production layout:

```text
recommended                         portable all-in-one

public/tunnel                       public/tunnel
     │                                   │
     ▼                                   ▼
┌─────────┐                         ┌─────────────────────┐
│ Go + UI │                         │ one container       │
└────┬────┘                         │ ├── Go + React      │
     │                              │ ├── MySQL 8.4      │
 ┌───┴────┐                         │ └── MinIO          │
 ▼        ▼                         └──────────┬──────────┘
MySQL   MinIO                              /data volume
volume  volume                    ├── mysql/ structured data
                                  └── minio/ uploaded objects
```

All-in-one has deliberately coupled upgrades, restarts, CPU/memory limits, and failure recovery. It is not suitable for HA or horizontal scaling. A single container failure stops all three processes. Keep external backups even though both data directories share one named volume.

## Choose the startup path

There are two valid paths:

| Situation | Command | Builds the image? |
| --- | --- | --- |
| The target machine already loaded a release image | `make all-in-one-start` | No |
| The target machine has the source checkout and should compile | `make all-in-one-deploy` | Yes |

The image-only path is the one to use after importing
`bc-atlas-cms-all-in-one:2026.08.16-storage`. It still needs the Compose file and a
private `.env.all-in-one` on the target machine; the image itself does not contain
deployment passwords or host port settings.

## Start an already-loaded image

Copy these files from the repository to the target machine:

```text
docker-compose.all-in-one.yml
scripts/deploy-all-in-one.sh
Makefile
.env.all-in-one.example
```

Create the private configuration:

```bash
cp .env.all-in-one.example .env.all-in-one
chmod 600 .env.all-in-one
```

Set at least these values in `.env.all-in-one`:

```dotenv
AIO_IMAGE=bc-atlas-cms-all-in-one
AIO_TAG=2026.08.16-storage
APP_BIND=127.0.0.1
APP_PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
COOKIE_SECURE=false

MYSQL_PASSWORD=generate-a-long-private-value
MYSQL_ROOT_PASSWORD=generate-a-different-private-value
MINIO_ROOT_PASSWORD=generate-a-different-private-value
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=generate-a-long-private-value
```

Use different values for the MySQL application user, MySQL root, MinIO, and the
B.C owner account. Do not commit this file or put it in a Docker build argument.

Start without rebuilding:

```bash
make all-in-one-start
```

The equivalent explicit command is:

```bash
docker compose \
  --env-file .env.all-in-one \
  -f docker-compose.all-in-one.yml \
  up -d --no-build --remove-orphans
```

`--no-build` is important: it guarantees that Compose uses the image already
loaded on the machine instead of trying to compile a new one.

## Code changes and in-container compilation

The release image also contains the pinned Node/npm and Go toolchains from the
base image. It does not contain your working source tree. Keep the Git checkout
on the host (or in a persistent workspace volume) and mount it into a temporary
compiler container. Override the image entrypoint with `bash`; this prevents
the MySQL, MinIO, and Go runtime processes from starting during compilation.

From the repository checkout:

```bash
docker compose \
  -f docker-compose.dev.yml \
  run --rm dev
```

The equivalent `docker run` form is also supported, but the Compose file keeps
the workspace and dependency caches consistent between sessions.

Inside the container, change code and run the checks manually:

```bash
npm ci
npm run build
npm run test:sites
go test ./...
go build -trimpath -o bin/bc-cms ./server/cmd/api
go build -trimpath -o bin/bc-content-storage ./server/cmd/content-storage
```

This step does not need `MYSQL_PASSWORD`, `MINIO_ROOT_PASSWORD`, or
`ADMIN_PASSWORD`, because no middleware or application server is running. The
compiled `bin/` files are written into the mounted checkout.

After a code change is validated, build a new immutable deployment image from
the checkout using `Dockerfile.all-in-one` and a new tag. Do not use
`docker commit` for releases; it would omit the reproducible build inputs:

```bash
docker build \
  --build-arg BASE_IMAGE_REF=bc-atlas-cms-base:2026.08.12 \
  -f Dockerfile.all-in-one \
  -t bc-atlas-cms-all-in-one:2026.08.17 .
```

Then point `AIO_TAG` at the new tag and use the normal runtime startup path.
The development shell and the runtime Compose stack are intentionally
separate concerns.

## One-command build and start

```bash
make all-in-one-deploy
```

This source-build path creates `.env.all-in-one` with mode `0600`, generates
random hexadecimal secrets, builds and verifies `Dockerfile.base`, builds
`Dockerfile.all-in-one`, starts the container, waits for `/api/health`, and
prints the generated owner password once. Do not use it on a machine that only
has the imported release image unless the complete source checkout and build
dependencies are also present.

Useful commands:

```bash
make all-in-one-status
make all-in-one-logs
make all-in-one-down
```

`make all-in-one-down` preserves the `all-in-one-data` named volume. Do not add `-v` unless both MySQL and MinIO data should be permanently deleted.

## Startup sequence and first-run data

For the imported image, the operational order is:

1. copy the Compose files and create `.env.all-in-one`
2. choose the host application and maintenance ports
3. set the MySQL, MinIO, and B.C administrator credentials
4. run `make all-in-one-start`
5. wait for `/api/health` and inspect `make all-in-one-status`
6. run content migration/reindex only if this is an existing data set

The All-in-One entrypoint starts MySQL, waits for it, starts MinIO, waits for
its readiness endpoint, and then starts the Go application. A fresh database
gets the normal SQL schema migrations during application startup. The
`bc-content-storage` commands are for moving legacy inline Markdown into
MinIO, rebuilding the MySQL search projection, and verifying object hashes;
they are not required for an empty new installation.

Passwords in `.env.all-in-one` are used on first initialization. Changing an
environment value later does not rewrite credentials already stored in an
existing `all-in-one-data` volume; rotate credentials inside the service or
perform a planned reinitialization after a backup.

Build only:

```bash
make all-in-one-image

AIO_IMAGE=registry.example/bc-atlas-cms-all-in-one \
AIO_TAG=2026.08.12 \
PLATFORMS=linux/amd64,linux/arm64 \
PUSH=1 \
./scripts/build-all-in-one-image.sh
```

To build or publish the reusable MySQL + source MinIO + Node + Go parent separately, follow [BASE_IMAGE.md](BASE_IMAGE.md).

## Credentials and configuration

`.env.all-in-one` is the deployment's source of configuration. It is ignored by Git and excluded from the Docker build context.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | B.C | Owner sign-in; bootstrapped on start |
| `MYSQL_USER` / `MYSQL_PASSWORD` | B.C + MySQL | Dedicated application database account |
| `MYSQL_ROOT_PASSWORD` | MySQL operator | Database administration and recovery only |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | B.C + MinIO | Local object-store credentials |
| `S3_BUCKET` | B.C + MinIO | Private object bucket, default `bc-content` |

The generated passwords are URI-safe hexadecimal values because the MySQL application password is interpolated into a DSN. If credentials are set manually, use long random values without shell syntax or DSN-reserved punctuation.

The application never needs `MYSQL_ROOT_PASSWORD`; the entrypoint uses root only for readiness and the official first-run initialization. MySQL creates `MYSQL_USER` with access to `MYSQL_DATABASE`, and the Go process connects as that application user.

The current single-node MinIO setup uses the MinIO root access key inside the trusted container. That keeps first-run bucket creation automatic. If object storage is moved to a shared or external service, create a dedicated application access key scoped to `S3_BUCKET`, then set `S3_ACCESS_KEY` and `S3_SECRET_KEY` in a deployment override rather than using an administrative key.

Changing `ADMIN_PASSWORD` and restarting updates the bootstrapped owner credential. Changing an initialized MySQL or MinIO password in the environment alone does not rewrite credentials stored in an existing data volume; rotate those credentials inside the service or perform a controlled reinitialization.

## Choosing ports

Edit `.env.all-in-one` before deployment:

```dotenv
# Public application
APP_BIND=127.0.0.1
APP_PORT=8180
PUBLIC_BASE_URL=https://notes.example.com
COOKIE_SECURE=true

# Local maintenance only
MYSQL_BIND=127.0.0.1
MYSQL_PORT=13306
MINIO_BIND=127.0.0.1
MINIO_API_PORT=19000
MINIO_CONSOLE_PORT=19001
```

The left side is the host listener; the container ports remain fixed at `8080`, `3306`, `9000`, and `9001`. For example, `127.0.0.1:8180:8080` means the host accepts traffic on `8180` and forwards it to the application on container port `8080`.

Use `APP_BIND=127.0.0.1` when a local tunnel or reverse proxy is the only public ingress. Only set `APP_BIND=0.0.0.0` when direct LAN access is intentional. Keep MySQL and both MinIO ports on `127.0.0.1`; do not expose or forward them to the public internet.

After an edit, apply the configuration with the command matching your path:

```bash
# Imported image:
make all-in-one-start

# Source build:
make all-in-one-deploy
```

## Startup and shutdown behavior

`bc-all-in-one-entrypoint` performs the following sequence:

1. validates required secrets
2. prepares `/data/mysql` and `/data/minio`
3. delegates database initialization to the official MySQL entrypoint
4. waits for authenticated MySQL readiness
5. starts MinIO and waits for its readiness endpoint
6. constructs internal `DATABASE_DSN` and S3 settings
7. starts the Go application as an unprivileged user
8. stops the whole container if any required process exits

Compose enables a minimal init process for signal forwarding and process reaping. The entrypoint sends `SIGTERM` to every child and gives the stack 45 seconds to stop cleanly.

## Data and backups

The named volume contains:

```text
/data
├── mysql/   accounts, sessions, articles, tags, comments, media metadata
└── minio/   image, video, audio, and document object bytes
```

A filesystem copy taken while MySQL is actively writing is not automatically a consistent database backup. Use `mysqldump` or a MySQL-aware snapshot and mirror the MinIO bucket as the same recovery point. Retain `.env.all-in-one` separately because it contains the credentials needed to open the restored services.

## Does this need Nginx?

No, not by default. The Go process already serves the compiled React application, APIs, RSS, and same-origin `/media/**` responses, including HTTP Range for video. If the tunnel already terminates HTTPS and forwards to `127.0.0.1:APP_PORT`, another proxy adds no required application feature.

Use an external Nginx layer when it owns a real edge concern: TLS certificates, multiple domains or applications on one host, IP allowlists, rate limiting, or centralized access logs. Keep it outside the all-in-one image so it can be upgraded independently. A starting configuration is available at `deploy/nginx/bc-atlas.conf.example`; its upload limit matches the application's current 512 MiB request limit and upload buffering is disabled.
