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

## One-command start

```bash
make all-in-one-deploy
```

The first run creates `.env.all-in-one` with mode `0600`, generates random hexadecimal secrets, builds and verifies `Dockerfile.base`, builds `Dockerfile.all-in-one`, starts the container, waits for `/api/health`, and prints the generated owner password once.

Useful commands:

```bash
make all-in-one-status
make all-in-one-logs
make all-in-one-down
```

`make all-in-one-down` preserves the `all-in-one-data` named volume. Do not add `-v` unless both MySQL and MinIO data should be permanently deleted.

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

After an edit, apply the configuration with:

```bash
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
