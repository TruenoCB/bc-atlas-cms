# Design QA — portrait reader navigation and layered home

## Evidence

- Reference captures: the four CookLLM portrait screenshots supplied in the task, normalized to the application-owned viewport.
- Implementation viewport: 768 × 1180 CSS pixels in the Codex in-app browser.
- Article comparison: `design/qa/comparison-article-toc.png`.
- Knowledge comparison: `design/qa/comparison-knowledge-navigation.png`.
- Additional states: `design/qa/portrait-knowledge-search.png` and `design/qa/portrait-home-map.png`.

## State and interaction checks

| Surface | State checked | Result |
| --- | --- | --- |
| Essay reader | scrolled body, sticky toolbar, expanded Markdown outline | Passed |
| Knowledge reader | B.C home mark, sticky Markdown outline, search open, right-to-left document directory drawer | Passed |
| Compact reader | existing Markdown outline promoted into the shared portrait toolbar | Passed |
| Portrait home | editorial foreground reveals one half-screen, full-extent pre-mounted global map, then returns when scrolling back | Passed |
| Essay footprint ending | fixed visual map is pointer-transparent, so native reader scrolling works in either direction | Passed |
| Portrait breakpoints | 320–1100px portrait uses a scrollable page root; legacy desktop back control is hidden behind the reader toolbar | Passed |
| Landscape home | editorial closing row, centre divider, and map frame share the same lower baseline | Passed |
| Landscape home map | regional pixel field extends into the lower part of its aligned frame without crossing the shared baseline | Passed |
| Dense footprint map | 100 markers without resting label collisions; label remains focus/hover driven | Passed |
| Shared article URL | Direct `/essays/:slug` load resolves the reader without waiting for archive interaction | Passed |
| Reduced motion | shared project fallback disables disclosure and sheet transition duration | Passed |

## Visual review history

1. Initial dense-map capture showed all 100 coordinate labels simultaneously. The renderer now suppresses resting labels above eight markers.
2. The original in-flow mobile TOCs scrolled out of reach. They were replaced by one sticky reader control with animated disclosure panels and a live current-section label.
3. The knowledge reader retained the entire desktop sidebar above the document. Portrait now removes the CardNav inside the reader, keeps a B.C home mark plus search and Markdown outline at the top, and opens the document hierarchy from a fixed right-to-left drawer while the desktop three-column layout remains unchanged.
4. The home map no longer relies on a click or drag handle. The full map stays loaded beneath the editorial sheet and appears through ordinary page scrolling; reversing the scroll restores the cover.
5. Final side-by-side comparisons confirm the same information hierarchy as the reference: a restrained top action row, an immediately reachable page outline, a dedicated document drawer where applicable, dark continuous surfaces, and content beginning directly below the expanded panel.

Final result: **passed**.
