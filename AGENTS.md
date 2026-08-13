# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- Brand: `B.C`; all interface controls and labels are English.
- Visual direction: minimal dark academic technology, warm-white editorial type, graphite map pixels, and restrained fluorescent violet accents.
- The final homepage source of truth is `design/reference-home-final.png` at a 1680×936 viewport. Match its split composition, visible density, typography, Asia-Pacific map framing, and uncluttered header, but omit the motorcycle/rider artwork by the latest product decision.
- Keep publishing and administrative actions available through navigation or authenticated workspace views. The default homepage keeps the reference split, with one discreet control on the divider that collapses the editorial column into a full-width global footprint map.
- Footprints are regular articles linked to the `footprint` tag. Tag properties carry typed metadata such as `latitude`, `longitude`, and `location_name`; do not hard-code a separate footprint-only content model.
- Map nodes must be driven by article data, open the linked article, and react locally to pointer movement.
- Chat and About are intentionally absent from the current product surface. Add future modules through the documented module registry/routing convention instead of coupling them to the publishing core.
- Knowledge is a first-class module containing multiple knowledge bases and ordered parent/child pages. It uses Markdown/LaTeX, S3 media URLs, and sandboxed interactive HTML blocks.
- Public content accepts named guest comments; authenticated comments keep their user relationship, while guest rows keep `user_id = NULL` and a validated display name.
- Public module pages open directly on their data without large repeated page titles or descriptions. Essays, Thoughts, and Field Notes are ordered newest-first and grouped by year and month with tag and keyword filters; RSS is visible only in Essays.
- Essays use the full-screen professional reader with a sticky table of contents, subtle scroll reveal, article log, comments, and the global footprint map as the final section. Other content types keep the compact reader.
- Pixel particles are the shared visual motif: the navigation `B.C` is a static dot-matrix wordmark, while large fallback artwork keeps pointer-repel interaction without scatter/gather. Use the footprint pixel map as a brighter ambient background across public modules. Only the homepage map opens footprint articles; background and essay-footer maps respond to the pointer but remain non-clickable.
- The essay footprint ending is a fixed background layer revealed under the rising article foreground. At the final scroll position the foreground stops at the viewport midpoint and the stationary footprint layer occupies only the lower half. Preserve the earlier minimal two-column layout on wide screens: copy and restrained B.C particles on the left, global map on the right.
- Title image priority is manual S3 cover, first body image, image-valued media tag, then the built-in pixel fallback. Ordinary content stores covers through the typed `cover` tag; knowledge bases use `cover_url` because they are collection entities.
- Knowledge opens through a searchable CardSwap catalog with a persistent library index on the left. The index highlights and scrolls with the front card, and selecting an index entry promotes its matching card; on portrait screens this index becomes a horizontal rail. Inside a knowledge base, the current library title is static and `All knowledge bases` returns to catalog search; there is no in-reader library wheel. Archive rows animate into view and expose year/month jump navigation. On narrow portrait screens, the desktop header becomes a compact CardNav while compact content readers retain their right-side card entrance.
- Use quiet, staggered entrance motion for major page elements, with a complete `prefers-reduced-motion` fallback. Motion should support the minimal editorial hierarchy rather than call attention to itself.
- Functional controls use restrained specular edge lighting: apply the moving rim to primary actions, RSS, and archive tag filters, while text inputs use a matching static glass edge and focus sheen. Keep navigation and content rows flat so the effect remains selective.
