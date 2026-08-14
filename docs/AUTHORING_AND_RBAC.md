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

Search covers type, title, slug, and summary. Each row exposes Preview and Duplicate. The author or an administrator also receives Edit, Publish/Unpublish, Archive, and Delete.

`New content`, `Edit`, and `Duplicate` reuse the same Composer:

- Create starts from an empty content model.
- Edit hydrates the original typed tags, cover, media reference, footprint properties, visibility, status, and Markdown, then updates by the original slug.
- Duplicate copies the source into a new slug and starts as a Draft.

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
| Manage another author's knowledge page | no | no | no | yes |
| Manage users and roles | no | no | no | not exposed yet |

Authorization is enforced by Go handlers, not by hidden buttons. The frontend uses the same rules only to avoid presenting actions that the server will reject.

Sessions last 30 days. The browser receives an `HttpOnly`, `SameSite=Lax` cookie; production HTTPS must set `COOKIE_SECURE=true`. Only a hash of the random session token is stored in MySQL.
