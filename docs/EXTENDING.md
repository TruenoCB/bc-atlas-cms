# Extending B.C CMS

## Add a frontend module

1. Create the module component under `src/components/` or a dedicated `src/modules/<name>/` directory.
2. Add one entry to `src/modules/registry.js`. Keep the stable `id` separate from its visible English label.
3. Add the corresponding view branch in `App.jsx`. Large modules should use `React.lazy` so the homepage bundle remains small.
4. Reuse the global tokens in `src/styles.css`; do not add a second visual system.
5. Add a public reading state, empty state, loading state, and authenticated authoring state where applicable.

Example registry entry:

```js
{ id: "research", label: "Research", view: "Research", kind: "research" }
```

## Add a backend module

1. Define request and response types plus validation in `server/internal/domain/<module>.go`.
2. Extend `store.Repository` only with operations the module actually needs.
3. Implement the operations in both `MemoryRepository` and `MySQLRepository`.
4. Add an idempotent numbered SQL migration. Never edit a migration already deployed to production; add the next number instead.
5. Create a focused handler file in `server/internal/httpapi/` and register its route prefix in `server.go`.
6. Enforce authentication and visibility on the server. UI hiding is not authorization.
7. Add handler tests that exercise guest, member, and editor/admin behavior.

## Add a typed content view

Use the content/tag model when the new feature is still an article with optional typed metadata. A training log, book note, project, or event can be a normal content record plus a tag schema:

```text
content
└── tag: training-log
    ├── rounds: number
    ├── intensity: number
    └── gym: string
```

Create a dedicated table only when the module has relationships or invariants that do not fit an article. Knowledge pages use dedicated tables because hierarchy, sibling ordering, and per-base slugs require foreign keys and efficient tree queries.

Reusable presentation metadata follows the same rule. Article, thought, gallery, and footprint title images use a `cover` tag (`url`, `alt`). A knowledge-base title image uses `knowledge_bases.cover_url` because it describes the collection itself. New renderers should call `resolveContentCover` rather than reading a specific field directly.

## Add infrastructure

Do not add middleware by default. Add it behind an interface and only for a measured requirement:

| Requirement | Add | Adapter boundary |
| --- | --- | --- |
| Multi-replica events/presence | Redis or NATS | event bus interface |
| Video thumbnails/transcoding | worker + queue | media job interface |
| Large corpus full-text search | Meilisearch/OpenSearch | search index interface |
| Billing/VIP | Stripe-compatible billing module | entitlement interface |
| AI retrieval | embedding worker + vector store | retrieval interface |

The core reading path must continue to work if an optional module is unavailable.

## Definition of done for a module

- English UI labels and keyboard-accessible controls
- Server-side validation and authorization
- MySQL migration and memory repository support
- API tests plus frontend build
- Docker configuration only when new infrastructure is truly required
- Documentation in this directory and a link from `README.md`
