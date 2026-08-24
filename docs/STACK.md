# Stack, middleware, and operational dependencies

## Runtime services

| Service | Role | Required now |
| --- | --- | --- |
| Go application container | API, authentication, static application files, RSS, S3 upload gateway | yes |
| MySQL 8.4 | structured metadata, hierarchy, accounts, sessions, comments, media metadata, and the article search projection | yes |
| MinIO | canonical article/knowledge Markdown plus images, video, audio, documents, and other binary objects through S3 | yes |

Two stateful middleware services are sufficient for the current scope. MySQL provides transactions and referential integrity; MinIO provides an S3-compatible object API. The application should not add Redis, Kafka/NATS, Elasticsearch, or a worker until a feature requires one.

## Frontend libraries

| Library | Use |
| --- | --- |
| React 19 | component and state model |
| Vite 6 | local development and production bundling |
| `react-markdown` | safe Markdown-to-React rendering |
| `remark-gfm` | tables, task lists, strikethrough, autolinks |
| `remark-math` + `rehype-katex` + KaTeX | LaTeX syntax and rendering |
| `d3-geo` + `world-atlas` + `topojson-client` | footprint map projection and country geometry |
| Phosphor Icons | interface icons |
| local Fontsource packages | self-hosted Inter and Cormorant Garamond |

Articles and knowledge pages share one renderer. `react-markdown` is safe by default and does not execute raw HTML. Self-contained demonstrations use a separate sandboxed iframe, while explicit `[embed](...)` links support an allowlist of video players without weakening the Markdown boundary.

## Go libraries

| Library | Use |
| --- | --- |
| `net/http` | HTTP server and routing |
| `database/sql` + `go-sql-driver/mysql` | MySQL access |
| `minio-go/v7` | S3-compatible object operations |
| `golang.org/x/crypto` | password hashing primitives |

The Go API intentionally avoids a large web framework. Module boundaries are expressed through domain types, repository interfaces, and focused handler files.

## Deployment

`Dockerfile` is a multi-stage build:

1. Node builds the React assets.
2. Go builds a static API binary.
3. A small Alpine image receives the binary and compiled web directory.

`docker-compose.yml` starts the app, MySQL, and MinIO with named volumes. `make deploy` initializes secrets when needed, validates Compose, pulls stateful images, builds the application image, starts the stack in dependency-health order, and waits for `/api/health`. `make down` stops containers without deleting data volumes.

The application container is non-root and read-only. Uploaded media is proxied through `/media/**`, so the bucket is not public and browser media remains same-origin. The bundled MinIO image is a reproducible single-node default; review [DEPLOYMENT.md](DEPLOYMENT.md) before treating it as a long-term production distribution.

## External documentation

- [react-markdown architecture and security](https://github.com/remarkjs/react-markdown)
- [KaTeX supported functions](https://katex.org/docs/supported)
- [D3 geographic projections](https://d3js.org/d3-geo/projection)
- [MySQL 8.4 foreign-key rules](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
- [MinIO S3 API compatibility](https://minio.community/community/minio-object-store/reference/s3-api-compatibility.html)
- [Docker Compose dependency health ordering](https://docs.docker.com/compose/how-tos/startup-order/)
