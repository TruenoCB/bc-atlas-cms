import test from "node:test";
import assert from "node:assert/strict";

import { extractMarkdownToc } from "../src/lib/markdownHeadings.js";
import { paginateItems } from "../src/lib/pagination.js";
import { parseAppRoute, routeForContent, routeForKnowledge } from "../src/lib/routes.js";

test("content slugs map to stable public routes", () => {
  assert.equal(routeForContent({ type: "article", slug: "calm-systems", tags: [] }), "/essays/calm-systems");
  assert.equal(routeForContent({ type: "article", slug: "tokyo", tags: [{ slug: "footprint" }] }), "/field-notes/tokyo");
  assert.equal(routeForKnowledge("systems", "start-here"), "/knowledge/systems/start-here");
  assert.deepEqual(parseAppRoute("/gallery/night-road"), { view: "Gallery", contentSlug: "night-road", baseSlug: "", pageSlug: "" });
  assert.deepEqual(parseAppRoute("/knowledge/systems/start-here"), { view: "Knowledge", contentSlug: "", baseSlug: "systems", pageSlug: "start-here" });
});

test("heading ids support Unicode and repeated headings", () => {
  assert.deepEqual(extractMarkdownToc("## 系统设计\n\n### 恢复路径\n\n## 系统设计"), [
    { depth: 2, title: "系统设计", id: "系统设计" },
    { depth: 3, title: "恢复路径", id: "恢复路径" },
    { depth: 2, title: "系统设计", id: "系统设计-2" },
  ]);
});

test("headings inside fenced code are excluded", () => {
  assert.deepEqual(extractMarkdownToc("## Visible\n\n```md\n## Not a heading\n```\n\n#### Detail"), [
    { depth: 2, title: "Visible", id: "visible" },
    { depth: 4, title: "Detail", id: "detail" },
  ]);
});

test("pagination keeps stable 100-item pages and clamps invalid boundaries", () => {
  const source = Array.from({ length: 205 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(source, 1).items, source.slice(0, 100));
  assert.deepEqual(paginateItems(source, 2).items, source.slice(100, 200));
  assert.deepEqual(paginateItems(source, 3), {
    items: source.slice(200), page: 3, pageSize: 100, total: 205, totalPages: 3,
  });
  assert.equal(paginateItems(source, 99).page, 3);
  assert.equal(paginateItems(source, 0).page, 1);
});
