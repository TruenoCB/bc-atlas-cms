# Content archive, Essay reader, and comments

## Archive behavior

Essays, Thoughts, and Field Notes are sorted by `publishedAt` descending. The client groups the result into year and month sections after applying filters. Keyword search covers title, summary, Markdown body, tag names, and tag slugs. Tag filters are derived from the visible module; structural `footprint` and `media` tags stay hidden from the filter bar.

The collection API also accepts `q`, `tag`, `type`, and `status` query parameters, so a future paginated archive can move filtering fully to MySQL without changing the UI model. The archive includes a keyboard-accessible year/month jump rail and rows animate only when they first enter the viewport; reduced-motion users receive the final state immediately.

RSS is linked only from the Essays archive. The feed remains available at `/rss.xml` for clients and feed readers.

## Reader modes

- Essays open in the full-screen reader: B.C masthead, byline, sticky heading index, long-form Markdown/LaTeX content, article log, discussion, and the linked footprint map.
- Thoughts, Gallery items, and Field Notes keep the compact reader.
- The first Markdown `h1` is hidden in the Essay body because the document title is already rendered by the reader masthead.
- The Essay ending is a fixed background layer. The opaque article foreground has a one-viewport trailing reveal area, so the two-column footprint note stays stationary while the article ending moves upward.

## Title images and thumbnails

Ordinary content stores an optional manual title image as a typed `cover` tag with `url` and `alt` properties. This keeps covers inside the extensible content/tag model instead of adding an article-only column.

The renderer resolves a cover in this order:

1. `cover.properties.url` uploaded explicitly by the author
2. the first Markdown image or HTML `<img>` in `bodyMarkdown`
3. an image-valued `media` tag
4. the built-in B.C pixel fallback

The same resolved cover is used by archive thumbnails, Gallery cards, compact readers, and the full Essay hero.

## Video embeds and HTML

Direct links to uploaded `.mp4`, `.webm`, `.m4v`, `.mov`, or `.ogv` objects render as native video with seeking through the same-origin `/media/**` gateway:

```markdown
[Training clip](/media/2026/08/object-id.mp4)
```

External players require explicit embed syntax. YouTube (privacy-enhanced), Vimeo, and Bilibili URLs are allowlisted and converted to iframe players:

```markdown
[embed](https://www.youtube.com/watch?v=VIDEO_ID)
```

Ordinary raw HTML inside Markdown is intentionally displayed as text rather than executed. For a self-contained interactive fragment, use an `html-sandbox` fenced block. It runs in an iframe with scripts but without same-origin access, parent-DOM access, forms, popups, frames, or `fetch`/XHR connections. HTTPS image and media sources are allowed. This supports small visual demonstrations without granting an article the CMS session.

## Guest comments

`POST /api/contents/{slug}/comments` accepts:

```json
{
  "authorDisplayName": "Guest Reader",
  "body": "A considered response.",
  "website": ""
}
```

For authenticated readers, the API ignores the submitted display name and uses the account name. For guests, the display name must contain 2–80 Unicode characters. Comment bodies accept 1–2000 Unicode characters. The hidden `website` field is a basic bot honeypot and must stay empty.

The `comments.user_id` foreign key is nullable. This preserves the normal user relationship for members while allowing a guest display name without creating a disposable account. Guest posting is limited to content the requester can already read; member-only and private articles do not become public through the comments endpoint.

For a public deployment, place rate limiting or a challenge mechanism at the reverse proxy before enabling high-volume anonymous traffic. Moderation continues to use the existing `comments.status` field.
