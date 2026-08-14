# Design QA

## Evidence

- Source visual truth: `design/reference-home-final.png` plus the five Browser Comment screenshots and annotations supplied on 2026-08-09.
- Primary implementation comparison: `design/qa/home-comparison.png`.
- Focused implementation captures:
  - `design/qa/route-transition-essays.png`
  - `design/qa/knowledge-catalog-search.png`
  - `design/qa/compact-reader-open.png`
  - `design/qa/essay-half-footnote.png`
  - `design/qa/portrait-menu.png`
  - `design/qa/portrait-knowledge.png`
  - `design/qa/portrait-essays.png`
  - `design/qa/portrait-essay-footnote.png`
  - `design/qa/knowledge-index-before.jpg`
  - `design/qa/knowledge-index-after.jpg`
  - `design/qa/knowledge-index-comparison.jpg`
  - `design/qa/knowledge-index-portrait.jpg`
- Desktop viewport: 1280 × 720 CSS px, 1280 × 720 screenshot px, device scale factor 1.
- Portrait viewport: 390 × 844 CSS px inside an in-app Browser iframe, captured in a 1280 × 720 QA stage at device scale factor 1.
- Source pixels: 1680 × 936. The full-view comparison fits both screenshots into equal-width columns without changing either image's aspect ratio.
- State: dark theme, public reader, seeded content, no authentication.

## Full-view comparison

`design/qa/home-comparison.png` places the selected homepage reference and current implementation in one image. The split editorial/map composition, warm editorial typography, graphite background, restrained violet accent, divider, and sparse navigation retain the selected direction. The reference motorcycle, rings, Chat, and About are intentionally absent because later product decisions explicitly removed them.

## Focused comparison

The focused Browser Comment targets were compared against browser-rendered captures at the same visible states. Separate crops were unnecessary because the selected controls and regions are clearly legible in the full viewport captures:

- archive route switch and RSS: `route-transition-essays.png`
- knowledge catalog search and card stack: `knowledge-catalog-search.png`
- compact reader entrance/exit surface: `compact-reader-open.png`
- desktop 50/50 essay ending: `essay-half-footnote.png`
- portrait navigation, archive, knowledge catalog, and 50/50 essay ending: the four portrait captures above
- synchronized knowledge index: `knowledge-index-comparison.jpg` pairs the same desktop catalog before and after the persistent index; `knowledge-index-portrait.jpg` verifies the 390 × 844 horizontal-rail fallback

## Required fidelity surfaces

- Fonts and typography: Cormorant Garamond remains the display face and Inter the interface/body face. Weight, wrapping, line height, and small uppercase metadata preserve the reference hierarchy at desktop and portrait widths.
- Spacing and layout rhythm: desktop public modules retain the quiet archive grid. The essay foreground stops at 359.9 px in a 720 px viewport; the fixed footnote begins at 360 px. Portrait measures 421.2/421 px in an 842 px inner viewport.
- Colors and tokens: all route transition frames retain `#08090a`/graphite surfaces. Violet is limited to focus, active, pixel, and specular states; no white transition frame remained.
- Image quality and asset fidelity: the pixel world map and particle wordmark render sharply as canvas/code-native system motifs. No placeholder raster assets were introduced. The motorcycle is intentionally omitted per the current product decision.
- Copy and content: all interface controls remain English. Knowledge search, archive filters, RSS, comments, and reader labels use the established product vocabulary.

## Interaction and runtime checks

- Tested Home → Essays → Thoughts → Knowledge → Gallery → Field Notes → Essays transitions; immediate captures stayed dark.
- Knowledge catalog search filtered `2 / 2` to `1 / 2`, and the resulting card opened the correct knowledge base.
- The knowledge index and CardSwap share one active index: clicking `Practice Notes` promoted that card and set `aria-selected=true`; the 5.2-second automatic rotation moved the selection from `Systems Field Manual` to `Practice Notes`; returning from the reader restored the searchable catalog.
- The in-reader OptionWheel/listbox is absent; the current knowledge-base title is static and `All knowledge bases` returns to the catalog.
- Compact reader close adds exit classes immediately and removes the dialog after the 420 ms animation.
- Desktop and portrait essay readers reach an exact half-height foreground/footnote split at maximum scroll.
- Portrait CardNav, archive, knowledge search/card stack, and essay footer were rendered and exercised at 390 × 844.
- Browser console errors: none.
- Build checks: `npm run build`, `npm run test:sites`, and `go test ./...` passed.

## Comparison history

1. Initial review found a P1 route-transition flash, a P2 in-reader OptionWheel, a P2 missing knowledge catalog search, a P2 abrupt compact-reader close, and a P1 full-height essay footnote. Fixes: persistent root/shell background, non-destructive WebGL cleanup, removed OptionWheel, added catalog filtering, added symmetric close motion, and changed the essay reveal to a fixed lower half. Post-fix evidence is in the desktop route, knowledge, reader, and essay captures.
2. Portrait review found a P2 footer layout regression: the particle component's base `position: relative` kept it in the mobile flex flow and pushed the copy out of its half-panel. Fix: a scoped higher-specificity absolute-position rule plus lower mobile opacity. Post-fix evidence is `design/qa/portrait-essay-footnote.png`.
3. Final review found no actionable P0, P1, or P2 visual differences. Remaining deviations from the original generated reference are intentional product decisions documented in `AGENTS.md`.
4. Knowledge catalog follow-up added a persistent left-side library index without replacing the approved card stack. The initial desktop pass verified the new hierarchy against the same-state before capture; portrait review then converted the index into a horizontally scrollable rail so it does not compress the card. Focus, progress, automatic rotation, manual selection, search filtering, and reader navigation were exercised in-browser with no console errors.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- P3: the production bundle still reports a large-chunk warning; route-level code splitting could improve first-load performance without changing the approved visual system.

final result: passed
