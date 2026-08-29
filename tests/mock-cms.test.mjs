import test from "node:test";
import assert from "node:assert/strict";
import {
  mockEssays,
  mockThoughts,
  mockGalleries,
  mockVideos,
  mockFootprints,
  mockKnowledgeBases,
  mockKnowledgePages,
  mockMedia,
} from "../src/data/mockCms.js";

test("frontend mock mode exposes 100 records for every public content family", () => {
  [mockEssays, mockThoughts, mockGalleries, mockVideos, mockFootprints, mockKnowledgeBases, mockKnowledgePages, mockMedia]
    .forEach((records) => assert.equal(records.length, 100));
});

test("mock slugs and ids are stable and unique", () => {
  const records = [...mockEssays, ...mockThoughts, ...mockGalleries, ...mockVideos, ...mockFootprints];
  assert.equal(new Set(records.map((item) => item.id)).size, records.length);
  assert.equal(new Set(records.map((item) => item.slug)).size, records.length);
  assert.ok(mockKnowledgePages.every((page) => mockKnowledgeBases.some((base) => base.id === page.knowledgeBaseId)));
});
