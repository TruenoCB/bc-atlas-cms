# Media and article storage

## Where each kind of content lives

| Data | Store | Reason |
| --- | --- | --- |
| Article and Thought Markdown | private S3-compatible object storage | canonical document bytes, immutable revisions, cheap backup/migration |
| Knowledge documents | private S3-compatible object storage | canonical document bytes while hierarchy and access rules stay in MySQL |
| Titles, summaries, state, users, comments, typed tags | MySQL | relational consistency |
| Search projection | MySQL `content_search` | keyword search without loading Markdown from S3 for every list query |
| Image, video, audio, PDF, archive, and other file bytes | private S3-compatible bucket | large-object streaming and independent lifecycle |
| Uploaded-object index | MySQL `media_objects` | original name, detected MIME type, size, bucket, object key |

Markdown contains stable `/media/{object-key}` references. It does not contain base64 file data, and article rows do not contain video bytes. New article and knowledge-page writes store Markdown in S3; MySQL keeps the object key, revision, SHA-256 hash, byte size, and a normalized search projection. Existing rows with inline Markdown continue to work until the migration command is run.

## Document object layout

Article and knowledge documents use deterministic, revisioned keys:

```text
bc-content/
├── contents/{content-id}/revisions/000001.md
├── contents/{content-id}/revisions/000002.md
└── knowledge/{page-id}/revisions/000001.md
```

The key is generated from an internal UUID, never from a title or user filename. Every write uploads the next revision before the MySQL transaction commits. If MySQL rejects the update, the newly uploaded object is deleted. Reads verify the recorded byte size and SHA-256 hash before returning the body. Old revisions are intentionally retained so a later history UI or rollback workflow can be added without changing the storage contract.

The `content_search` table stores title, summary, normalized Markdown text, and tag text. The API still uses a case-insensitive `LIKE` query today, so the feature remains portable and works for non-Latin text; the table also has a MySQL FULLTEXT index for a future high-volume search adapter.

## Object layout and upload transaction

Objects use immutable, non-user-controlled keys:

```text
bc-content/
└── 2026/
    └── 08/
        └── 550e8400-e29b-41d4-a716-446655440000.mp4
```

The original filename is retained as S3 metadata and in MySQL, but never used as a path. The upload sequence is:

1. require an editor/admin session
2. cap the HTTP body at 512 MiB
3. stream the multipart file instead of buffering the whole upload
4. detect MIME from the first 512 bytes, using the extension only as an unknown-type fallback
5. stream to the S3 adapter
6. insert the matching `media_objects` row
7. delete the S3 object if the metadata insert fails

This is not a distributed transaction, but the compensating delete prevents the common metadata-failure orphan. A periodic orphan audit can be added later for crash recovery between steps 5 and 6.

## Private delivery

The bucket does not need a public policy. The browser requests `/media/{object-key}` from the Go application; Go reads from S3 and returns the detected content type, immutable cache headers, and HTTP Range support. Range is what lets native video players seek without downloading the complete file first.

Images (except SVG), video, and audio may render inline. Other object types are returned as attachments with a safely encoded original filename. SVG is deliberately treated as a download because active SVG content has a larger script/security surface.

## Supported formats

The storage layer accepts arbitrary binary formats up to the request limit. Images, browser-decodable audio/video, and PDFs can be referenced from content; whether a native `<video>` plays a codec still depends on the reader's browser. The current application does not transcode or generate thumbnails. Add a queue and media worker later when automatic HLS renditions, poster frames, EXIF extraction, or very large resumable uploads become necessary.

Direct video links ending in `.mp4`, `.webm`, `.m4v`, `.mov`, or `.ogv` become native players. External YouTube, Vimeo, and Bilibili players require explicit `[embed](URL)` Markdown. Raw HTML is not executed in the article DOM; `html-sandbox` blocks run isolated scripts without access to the CMS session.

## Provider portability

The `media.Store` and `media.ContentStore` interfaces isolate HTTP handlers from the provider. `MinIOStore` uses `minio-go` and standard S3 operations, so deployment can move to another compatible endpoint by changing environment values. Keep `/media` as the application route; the browser never receives S3 credentials or needs to know the bucket hostname.

## Migration and verification

The application is backward-compatible, but moving existing inline Markdown is an explicit maintenance operation so it can be preceded by a backup:

For the recommended Compose deployment, run the compiled maintenance binary inside the already-connected app container:

```bash
docker compose --env-file .env exec app /app/bc-content-storage -mode verify
docker compose --env-file .env exec app /app/bc-content-storage -mode migrate
docker compose --env-file .env exec app /app/bc-content-storage -mode reindex
docker compose --env-file .env exec app /app/bc-content-storage -mode verify
```

For All-in-One, replace `app` with `bc`. From a checkout with direct host access to MySQL and MinIO, the equivalent convenience targets are `make content-verify ENV_FILE=.env`, `make content-migrate ENV_FILE=.env`, and `make content-reindex ENV_FILE=.env`.

`content-migrate` uploads only rows without an object key, records the key/hash/size in the same logical update, and leaves already migrated rows untouched. `content-reindex` rebuilds keyword-search text from either S3 or the legacy inline body. `content-verify` reads every recorded object and checks size and hash. The scripts require `DATABASE_DSN`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET`; they never print secret values.

## Backup rule

MySQL and the bucket form one logical recovery point. Restore both together: MySQL alone loses document/media bytes, while the bucket alone loses articles, access rules, search projections, and the object index.
