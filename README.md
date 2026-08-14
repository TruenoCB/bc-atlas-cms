# B.C Atlas CMS

A self-hosted personal publishing foundation for essays, thoughts, media, hierarchical knowledge bases, and location-linked field notes. The React frontend and Go API compile into one application image; MySQL stores structured site data and MinIO stores uploaded files through an S3-compatible API.

## What is implemented

- Dark academic, responsive English-language interface for the `B.C` brand.
- Interactive pixel world map with restrained pointer parallax and local pixel lift.
- Source-matched quiet homepage with an Asia-Pacific field-note map and a discreet full-world expansion control.
- Footprint markers derived from article tag data and linked back to their article reader.
- Searchable Essays, Thoughts, Gallery, Field Notes, Knowledge, and owner Workspace modules.
- Multiple knowledge bases with collapsible parent/child page trees, per-page tables of contents, Markdown, GFM, LaTeX, images, native video, and sandboxed interactive HTML.
- Unified publishing flow for essays, thoughts, galleries, video, and footprints with Markdown, GFM, LaTeX preview, visibility, typed coordinates, and S3 media upload.
- Persistent registration, password hashing, private sessions, `member`/`editor`/`admin` roles, and server-enforced article visibility.
- Status-aware Workspace with reusable create/edit/duplicate Composer and Preview, Publish/Unpublish, Archive, and Delete actions.
- Persistent article comments for signed-in readers and named guests.
- Extensible content/tag/property schema shared by MySQL and the in-memory development repository.
- Go endpoints for content CRUD, comments, footprints, tag schema, RSS, health checks, and S3 media upload.
- Multi-stage Docker image containing the built React frontend and Go server.
- Docker Compose stack with the app, MySQL 8.4 LTS, and MinIO.
- Reusable pinned build base containing MySQL 8.4, Node/npm, Go, and MinIO compiled from its archived community source.
- Optional all-in-one image with coordinated MySQL, source-built MinIO, and application startup for portable single-node deployment.
- All fonts, images, JavaScript, CSS, and media references are served by the self-hosted stack; there are no frontend CDN dependencies.

VIP billing, payments, tips, AI retrieval, and background media processing remain isolated later modules rather than being coupled to the content core. Chat and About are intentionally omitted from the current product.

## Start locally

```bash
npm install
npm run dev
```

In another terminal:

```bash
go run ./server/cmd/api
```

The frontend is available at `http://localhost:4173` and proxies `/api` and `/rss.xml` to the Go server on port `8080`.

## One-command Docker deployment

```bash
make deploy
```

On the first run the deployment script creates a mode-0600 `.env` with random database, object-storage, and administrator secrets, builds the application image, starts all three containers, and waits for the complete health check. Save the one-time administrator password printed by the script, then open `http://localhost:8080`.

MinIO's administration console binds to loopback at `http://127.0.0.1:9001`. Before public access, set `PUBLIC_BASE_URL` to the HTTPS tunnel address, keep MinIO private, and set `COOKIE_SECURE=true`.

The values `ADMIN_EMAIL` and `ADMIN_PASSWORD` bootstrap or update the owner account at startup. Use a unique password of at least 12 characters. Set `COOKIE_SECURE=true` when the public tunnel terminates HTTPS for the application.

```bash
make logs
make down
```

`make down` stops the stack but keeps the named MySQL and MinIO volumes.

For a single portable container instead:

```bash
make all-in-one-deploy
```

This creates a separate `.env.all-in-one`, builds the application + MySQL + MinIO image, and persists both state directories in one named `/data` volume. The standard three-container stack is still preferred when independent upgrades, recovery, or scaling matter. See [All-in-one deployment](docs/ALL_IN_ONE.md) for credentials, host-port overrides, tunnel binding, and the Nginx decision.

To run only the reusable base image's MySQL and source-built MinIO services with private custom credentials:

```bash
make middleware-init
make middleware-up
```

The interactive initializer hides password input and writes a Git-ignored mode-0600 `.env.middleware`. See [Base image](docs/BASE_IMAGE.md#configure-accounts-and-run-the-middleware-image).

## Content model

Footprints are normal articles, not a separate hard-coded record type:

```text
article
└── tag: footprint
    ├── latitude: number
    ├── longitude: number
    └── location_name: string
```

The same tag-property system can later support typed tags such as `book`, `project`, `research-note`, or `training-log` without changing the base article table. Each map marker is projected directly from the `footprint` tag's properties and opens the source article.

## HTTP surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Register a member and create a private session |
| `POST` | `/api/auth/login` | Sign in and set the HTTP-only session cookie |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | Read the current member state |
| `GET` | `/api/footprints` | Published footprint-tagged articles |
| `GET` | `/api/contents?type=&tag=&status=&q=` | Date-sorted content collection with type, tag, status, and keyword filters |
| `POST` | `/api/contents` | Publish content and its typed tags |
| `GET/PUT/DELETE` | `/api/contents/{slug}` | Read, edit, or delete one content entry |
| `GET/POST` | `/api/contents/{slug}/comments` | Read or publish article comments |
| `GET` | `/api/schema/tags/footprint` | Footprint tag property schema |
| `POST` | `/api/media` | Stream images, video, audio, documents, and other files to S3/MinIO (512 MiB request limit) |
| `GET/HEAD` | `/media/{object-key}` | Same-origin media delivery with cache and HTTP Range support for video seeking |
| `GET/POST` | `/api/knowledge-bases` | List or create knowledge bases |
| `GET/POST` | `/api/knowledge-bases/{base}/pages` | List or publish hierarchical knowledge pages |
| `GET/PUT/DELETE` | `/api/knowledge-bases/{base}/pages/{page}` | Read, edit, or delete a knowledge page |
| `GET` | `/rss.xml` | RSS 2.0 feed |

## Repository layout

```text
src/                         React product interface
src/modules/                 Frontend module registry and future module seams
server/cmd/api/              Go application entrypoint
server/internal/domain/      Content, knowledge, membership, and typed-tag rules
server/internal/auth/        Password and private-session primitives
server/internal/httpapi/     HTTP, RSS, and static rendering layer
server/internal/store/       Memory/MySQL repository implementations
server/internal/media/       S3-compatible MinIO adapter
server/internal/store/migrations/
public/assets/               Local visual assets served by the app
docs/                        Architecture, schema, extension, stack, and authoring guides
Dockerfile                   React + Go application image
Dockerfile.base              Reproducible MySQL + Node + Go + source MinIO parent
Dockerfile.all-in-one        Portable app + MySQL + MinIO image
docker-compose.yml           App + MySQL + MinIO stack
docker-compose.all-in-one.yml Single-container stack and shared data volume
```

## Why only MySQL and S3 for now

Those two services are sufficient for the current publishing milestone: MySQL owns transactional metadata, knowledge hierarchy, accounts, and sessions; MinIO owns large binary objects. When background media processing or large-corpus search arrives, add a queue/worker or search index as optional modules instead of making them prerequisites for ordinary reading and publishing.

## Maintenance documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Registration, authoring workflow, and RBAC](docs/AUTHORING_AND_RBAC.md)
- [Extending the CMS](docs/EXTENDING.md)
- [Database and storage schema](docs/DATABASE.md)
- [Media and article storage](docs/MEDIA_STORAGE.md)
- [Knowledge-base authoring and API](docs/KNOWLEDGE_BASE.md)
- [Content archive, Essay reader, and guest comments](docs/CONTENT_AND_COMMENTS.md)
- [Stack and middleware](docs/STACK.md)
- [Build, image, and one-command deployment](docs/DEPLOYMENT.md)
- [All-in-one image, credentials, ports, and Nginx](docs/ALL_IN_ONE.md)
- [Middleware/toolchain base image and source MinIO build](docs/BASE_IMAGE.md)

## Verification

```bash
npm run build
npm run test:sites
go test ./...
docker compose config
```
