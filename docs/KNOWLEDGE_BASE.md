# Knowledge base guide

## Reader model

Knowledge uses a two-level navigation model:

1. Opening the top navigation item shows a stacked CardSwap catalog of knowledge bases. A persistent library index lists every filtered base, follows the current front card during automatic rotation, and can promote a selected base to the front. Every card exposes the title, description, visibility, and a clear entry action.
2. Opening a card enters that knowledge base's document reader. `All knowledge bases` returns to the catalog.

The catalog has a title-and-description search so a large set of libraries stays discoverable. Search filters the index and stack together and resets focus to the first result. The desktop index scrolls vertically; on narrow screens it becomes a horizontal rail above the card stack. The reader follows the useful structure shared by large tutorial sites:

- left: return action, current knowledge-base title, in-library search, collapsible chapter tree
- center: the active document
- right: headings from the active page

The implementation was visually grounded in [CookLLM](https://cookllm.com/docs) and the multi-series organization of [小林面试笔记](https://xiaolinnote.com/), while retaining the B.C dark academic visual system.

## Authoring model

An editor can create multiple knowledge bases and then publish top-level or child pages. Sibling order is controlled by the numeric `position` field. Page slugs only need to be unique inside their knowledge base.

Knowledge is a pair of first-class content types in the ordinary `contents` table: `knowledge_base` and `knowledge_page`. A base gets its catalogue-only fields from `knowledge_base_details`; a page gets its base membership, parent, route slug, and order from `knowledge_structure`. This keeps common authoring, permissions, lifecycle, MinIO body storage, Workspace management, and keyword search unified without flattening the chapter tree into article tags.

It is nevertheless managed alongside articles: Workspace projects both `knowledge base` and `knowledge page` entries into the same searchable All content / Drafts / Published / Archived surface. The familiar Preview, Edit, Publish/Unpublish, Archive, and Delete actions are available where the corresponding record has that lifecycle. Collection rows open the library; document rows open the selected chapter.

Opening **Edit** on a document uses the same authoring pattern as articles: Markdown source is on the left and a live rendered preview is on the right. The page reader also exposes **Edit** directly to its author or an administrator. Creating a document uses that same composer in create mode.

Knowledge-base ownership is explicit. The editor who creates a base becomes its author; that author or an administrator can rename, change visibility/order/cover, create chapters, or delete the collection. Deleting a collection deletes its contained pages. A document remains owned independently by the editor who created it, and an editor can edit/delete only their own document pages.

### Markdown and LaTeX

Knowledge pages use the same GFM and KaTeX pipeline as articles:

```markdown
# Page title

## Section

| Signal | Meaning |
| --- | --- |
| latency | waiting time |

$$E = mc^2$$
```

### Images

Upload an image in the editor. The returned S3 URL is inserted using normal Markdown:

```markdown
![Architecture overview](https://media.example/object.png)
```

A knowledge base may also have a dedicated `coverUrl` uploaded to S3. Catalog cover resolution is: explicit `coverUrl`, then the first image found in one of its pages, then the built-in book/pixel fallback. The URL lives in `knowledge_base_details.cover_url`; the base itself is a `contents` row of type `knowledge_base`.

### Video

Upload a video and link to its URL. Links ending in `.mp4`, `.webm`, `.m4v`, or `.mov` render as a native video player:

```markdown
[Training clip](https://media.example/clip.mp4)
```

For an external player, use an explicit allowlisted embed link. YouTube, Vimeo, and Bilibili are supported; an ordinary link to another host remains an ordinary safe anchor:

```markdown
[embed](https://vimeo.com/123456789)
```

### Interactive HTML

Use an `html-sandbox` fenced block for a small self-contained demonstration:

````markdown
```html-sandbox
<button id="run">Run</button>
<output id="result"></output>
<script>
  document.querySelector('#run').onclick = () => {
    document.querySelector('#result').textContent = 'Complete';
  };
</script>
```
````

The block runs inside an iframe with `sandbox="allow-scripts"` and a restrictive Content Security Policy. It has no same-origin permission, cannot access the CMS session or parent DOM, cannot open child frames, and cannot make `fetch`/XHR connections. HTTPS image and media sources remain available. This is intentionally safer than enabling raw scripts inside Markdown.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/knowledge-bases` | list or create knowledge bases |
| `GET/PUT/DELETE` | `/api/knowledge-bases/{base}` | read, edit, or delete one knowledge base |
| `GET/POST` | `/api/knowledge-bases/{base}/pages` | list or create pages |
| `GET/PUT/DELETE` | `/api/knowledge-bases/{base}/pages/{page}` | read, update, or delete a page |

Writes require an editor or admin session. Ownership is enforced by the Go API, not merely hidden UI controls. Member and private visibility are also enforced by the API.

## Why not add Docusaurus/Nextra/Fumadocs

Those projects are strong choices for repository-authored static documentation. This CMS needs database-authored documents, member visibility, the existing Go authorization model, and MinIO uploads in the same owner workflow. The current implementation therefore reuses `react-markdown`, `remark-gfm`, `remark-math`, and `rehype-katex` and implements the small tree/navigation layer locally. This avoids a second application runtime and a second content source of truth.
