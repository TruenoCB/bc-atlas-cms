# Media and article storage

## Where each kind of content lives

| Data | Store | Reason |
| --- | --- | --- |
| Article and Thought Markdown | MySQL `contents.body_markdown` | transactional edits, visibility, search, tags, comments |
| Knowledge documents | MySQL `knowledge_pages.body_markdown` | hierarchy and access rules stay with the document |
| Titles, summaries, state, users, comments, typed tags | MySQL | relational consistency |
| Image, video, audio, PDF, archive, and other file bytes | private S3-compatible bucket | large-object streaming and independent lifecycle |
| Uploaded-object index | MySQL `media_objects` | original name, detected MIME type, size, bucket, object key |

Markdown contains stable `/media/{object-key}` references. It does not contain base64 file data, and article rows do not contain video bytes.

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

The `media.Store` interface isolates HTTP handlers from the provider. `MinIOStore` uses `minio-go` and standard S3 operations, so deployment can move to another compatible endpoint by changing environment values. Keep `/media` as `S3_PUBLIC_URL` to preserve article URLs across provider or hostname changes.

## Backup rule

MySQL and the bucket form one logical recovery point. Restore both together: MySQL alone loses media bytes, while the bucket alone loses articles, access rules, and the object index.
