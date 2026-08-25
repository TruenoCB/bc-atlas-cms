# Registration, authoring workflow, and RBAC

## Registration and owner access

The public registration flow is available from `Sign in` → `New here? Create an account`. A reader enters a display name, email, and password of at least 12 characters. Successful registration creates a `member` account and signs it in immediately.

Self-registration never grants publishing access. The owner account is bootstrapped from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_DISPLAY_NAME` at application startup and receives the `admin` role. Additional editors currently require an intentional database role change or a future administrator user-management module; there is no public role-escalation endpoint.

## Content workspace

An editor or administrator opens the account control in the top-right header and enters `Workspace`. The workspace retrieves all content states and provides four persistent views:

- All content
- Drafts
- Published
- Archived

Search covers type, title, slug, summary, and knowledge-base context. Article records, `knowledge base` collections, and `knowledge page` documents appear together in the same Workspace list. Each row exposes Preview; articles also expose Duplicate. The author or an administrator also receives Edit, Publish/Unpublish, Archive, and Delete where that operation applies.

`New content`, `Edit`, and `Duplicate` reuse the same Composer:

- Create starts from an empty content model.
- Edit hydrates the original typed tags, cover, media reference, footprint properties, visibility, status, and Markdown, then updates by the original slug.
- Duplicate copies the source into a new slug and starts as a Draft.

Edit is a side-by-side authoring surface: Markdown source is on the left and the rendered preview is on the right. This applies to both ordinary content and knowledge documents. A content or knowledge preview also includes an Edit action for its author or an administrator, so no return trip to Workspace is required.

Knowledge bases are collection records rather than ordinary articles, because their ordered chapter tree needs durable parent/child relations. They are still first-class Workspace rows. The base creator owns its collection; each knowledge page has its own author. Editors manage only the records they authored, while administrators manage all records.

### Inline images in Markdown

In the Composer's **Write** mode, place the caret where the image should appear
and either click **Insert image** or paste an image directly from the clipboard.
The image is uploaded through `POST /api/media`, stored in the private S3 bucket,
and inserted as ordinary Markdown such as:

```markdown
![Architecture overview](/media/2026/08/550e8400-e29b-41d4-a716-446655440000.png)
```

Only editors and administrators can upload. The returned URL is the CMS's
same-origin `/media/...` route, not a public MinIO URL; the browser never
receives S3 credentials. The separate **Title image** control uploads a cover
into the typed `cover` tag and does not insert body Markdown.

### Inline local video

In the same **Write** toolbar, click **Insert video**, select an `.mp4`,
`.webm`, `.m4v`, `.mov`, or `.ogv` file, and the Composer inserts a link such
as the following at the cursor:

```markdown
[Night train](/media/2026/08/550e8400-e29b-41d4-a716-446655440000.mp4)
```

The Markdown renderer recognizes those local video extensions and turns the
link into a same-origin native player with seek support. Prefer MP4 encoded as
H.264 video with AAC audio for the broadest browser compatibility. The current
upload limit is 512 MiB and there is no automatic transcoding yet.

### Media Library

The Workspace header opens **Media library** for editors and administrators.
It searches the MySQL media-object index by original filename, object key, or
MIME type; filters Images, Videos, Audio, and other Files; previews browser
playable media; and copies either the same-origin `/media/...` link or ready-to-
paste Markdown. It never shows a MinIO endpoint or credentials.

Media deletion is intentionally not exposed yet: an object can be referenced
by multiple Markdown documents, and deleting it without reference tracking
would create broken articles. A future cleanup feature should first report all
references and only offer deletion for confirmed unreferenced objects.

Changing a Draft or Archived item to Published refreshes `published_at` so archive ordering reflects the actual publication event. Unpublish moves an item to Draft without deleting it. Archive keeps the record and media references. Delete is permanent and requires confirmation.

## Content lifecycle

```text
Draft ──Publish──> Published ──Unpublish──> Draft
  │                    │
  └────Archive─────────┴────Archive──────> Archived

Archived ──Publish──> Published
```

Draft and Archived bodies are never readable by a guest through a guessed slug. They are available only to their author and administrators.

## RBAC matrix

| Capability | Guest | Member | Editor | Admin |
| --- | --- | --- | --- | --- |
| Read public published content | yes | yes | yes | yes |
| Read member published content | no | yes | yes | yes |
| Post a named guest comment | yes | — | — | — |
| Post an account-linked comment | no | yes | yes | yes |
| Create content and upload media | no | no | yes | yes |
| Manage own content and drafts | no | no | yes | yes |
| Manage another author's content | no | no | no | yes |
| Read private content | no | no | own only | all |
| Create knowledge bases/pages | no | no | yes | yes |
| Manage own knowledge base and pages | no | no | yes | yes |
| Manage another author's knowledge page | no | no | no | yes |
| Manage users and roles | no | no | no | not exposed yet |

Authorization is enforced by Go handlers, not by hidden buttons. The frontend uses the same rules only to avoid presenting actions that the server will reject.

Sessions last 30 days. The browser receives an `HttpOnly`, `SameSite=Lax` cookie; production HTTPS must set `COOKIE_SECURE=true`. Only a hash of the random session token is stored in MySQL.
