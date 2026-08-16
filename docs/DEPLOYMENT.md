# Build, image, and one-command deployment

## Deployment unit

The deployable application is one OCI image containing the statically compiled Go API, the production React bundle, self-hosted frontend assets, and embedded SQL migrations.

MySQL and S3-compatible storage remain separate stateful containers. They are started by the same Compose command, but must not be copied into the application image: independent volumes, upgrades, health checks, backups, and failure recovery are the reason containers exist here.

```text
docker compose
├── app      one B.C image, Go + compiled React
├── mysql    structured state
└── minio    binary object state
```

This is the recommended one-command deployment with three independently managed containers. A portable single-container alternative is also available for personal single-node hosts; see [All-in-one container deployment](ALL_IN_ONE.md).

## First deployment

Start Docker Desktop or Docker Engine, then run:

```bash
make deploy
```

On the first run `scripts/deploy.sh` creates a mode-0600 `.env` with random MySQL, MinIO, and administrator credentials. It prints the initial administrator password once. The script validates Compose, pulls stateful images, builds the application image, starts the stack, waits for `/api/health`, and prints container status.

```bash
make status
make logs
make down
```

`make down` keeps the named `mysql-data` and `minio-data` volumes. Never use `docker compose down -v` unless permanent deletion is intended and both services are backed up.

## Building the application image

Local architecture:

```bash
APP_IMAGE=registry.example/bc-atlas-cms APP_TAG=2026.08.09 make image
```

Explicit tag:

```bash
./scripts/build-image.sh registry.example/bc-atlas-cms:2026.08.09
```

Multi-architecture registry build:

```bash
APP_IMAGE=registry.example/bc-atlas-cms \
APP_TAG=2026.08.09 \
PLATFORMS=linux/amd64,linux/arm64 \
PUSH=1 \
./scripts/build-image.sh
```

The image is non-root, read-only at runtime, includes CA certificates for TLS S3 providers, and exposes an application health check. Compose waits for MySQL and object storage health before starting it.

## Portable all-in-one alternative

```bash
make all-in-one-deploy
```

This first builds the reusable `Dockerfile.base` containing MySQL 8.4, Node/npm, Go, and source-built MinIO, then builds `Dockerfile.all-in-one` with the application. It runs the application, MySQL, and MinIO inside one container with one `/data` volume. It has a separate mode-0600 `.env.all-in-one`, separately configurable host ports, coordinated readiness checks, signal handling, and health checks. It is convenient for a single personal server but couples all upgrades and failures; the three-container topology above remains the preferred durable deployment.

See [Base image](BASE_IMAGE.md) for reproducible compilation and registry publication. See [All-in-one container deployment](ALL_IN_ONE.md) for credentials, port selection, data layout, backup boundaries, and the Nginx decision.

## Public access and tunnels

Set these before exposing the stack:

```dotenv
PUBLIC_BASE_URL=https://notes.example.com
COOKIE_SECURE=true
APP_BIND=127.0.0.1
```

Bind the app to `127.0.0.1` when a tunnel or local reverse proxy is the only public entry point. Terminate HTTPS at that trusted edge. MinIO API and console ports bind to loopback by default and should not be forwarded publicly.

The Go process serves the SPA, API, RSS, and `/media/**` from one public origin. Media bytes are proxied from the private bucket and support HTTP Range requests for video seeking. Uploaded object URLs remain stable when the public hostname changes.

Nginx is optional. Add it as an external reverse proxy only when it provides TLS, multi-site routing, edge policy, or centralized logs that the tunnel does not already provide. Do not install it inside the application or all-in-one image.

## Rendering clarification

The container returns the application shell and every frontend asset locally; it does not depend on a CDN. React currently performs client-side rendering after those files arrive. It is not HTML SSR. The API and protected article bodies are served by Go, and browsers still make normal same-origin requests for JS, JSON, images, and video. SSR can be added later as a presentation adapter without changing the domain or storage model.

## S3-compatible providers

The Go adapter uses the S3 API through `minio-go`, so the same application can target MinIO, Garage, SeaweedFS S3, AWS S3, Cloudflare R2, Backblaze B2, or another compatible service by changing environment values:

```dotenv
S3_ENDPOINT=s3.example.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=bc-content
S3_SECURE=true
S3_PUBLIC_URL=/media
```

The recommended three-container Compose file still pins a legacy MinIO community binary for reproducibility. In 2026, MinIO's community project moved to source-only distribution and archived the repository. Treat that separate-container image as a convenient single-node default, not an automatic long-term security-update channel. The all-in-one path instead compiles the final archived community source at an immutable commit and includes its source archive and license in the base image. Because the repository is archived, source compilation improves provenance but does not provide future security maintenance. For a durable public deployment, consider a maintained S3-compatible provider or product. The application image does not change.

## Backup and restore contract

Back up both state stores as one recovery point:

1. take a consistent MySQL dump or snapshot
2. mirror or version the `bc-content` bucket
3. retain `.env` secrets separately
4. restore MySQL metadata and S3 objects together

New article and knowledge-page Markdown is canonical in S3 under revisioned `contents/{id}/revisions/{n}.md` and `knowledge/{id}/revisions/{n}.md` keys. MySQL stores metadata, access rules, the object hash/size, and the `content_search` keyword projection; `body_markdown` remains only as a legacy fallback until the explicit migration command is run. Images, video, audio, and other uploaded binaries are also in S3. A MySQL-only backup does not contain document/media bytes, and an S3-only backup does not contain titles, permissions, tags, comments, or search metadata.

## Release checklist

```bash
npm run build
npm run test:sites
go test ./...
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.all-in-one.example -f docker-compose.all-in-one.yml config --quiet
./scripts/build-image.sh bc-atlas-cms:release-candidate
```

The image build requires a running Docker daemon. On a build host whose network proxy makes the public package registries slow, override only the dependency mirrors for that build; the source and lockfiles remain unchanged:

```bash
NPM_REGISTRY=https://registry.npmmirror.com \
GOPROXY=https://goproxy.cn,direct \
./scripts/build-image.sh bc-atlas-cms:release-candidate
```
