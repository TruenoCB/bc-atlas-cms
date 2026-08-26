import test from "node:test";
import assert from "node:assert/strict";

import { extractMarkdownToc } from "../src/lib/markdownHeadings.js";
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
