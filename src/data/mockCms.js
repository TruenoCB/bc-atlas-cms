const pad = (value) => String(value).padStart(3, "0");

function publishedAt(index) {
  const year = 2026 - Math.floor(index / 24);
  const month = 12 - (index % 12);
  const day = 1 + (index * 7) % 27;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00:00Z`;
}

function markdown(title, index, kind) {
  return `# ${title}

This is deterministic frontend mock content for the ${kind} reader. Record ${pad(index + 1)} is intentionally long enough to test navigation, responsive typography, and scroll position.

## Orientation

Good interfaces reveal the next useful action without making the reader reconstruct the entire system.

### A smaller signal

The mobile reader keeps this heading within reach through the live table of contents.

## Working notes

The source remains ordinary Markdown, so production content uses the same renderer as this local mock.

### What to keep

1. Preserve document structure.
2. Keep recovery paths visible.
3. Prefer calm, reversible interactions.

## Closing observation

Mock data is generated in the repository and never requires the Go API.`;
}

function contentRecord(kind, index, overrides = {}) {
  const serial = pad(index + 1);
  const label = kind === "article" ? "Essay" : kind[0].toUpperCase() + kind.slice(1);
  const title = `${label} field record ${serial}`;
  return {
    id: `mock-${kind}-${serial}`,
    type: kind,
    slug: `mock-${kind}-${serial}`,
    title,
    summary: `A generated ${kind} record for responsive frontend testing.`,
    bodyMarkdown: markdown(title, index, kind),
    status: "published",
    visibility: index % 17 === 0 ? "members" : "public",
    publishedAt: publishedAt(index),
    tags: [
      { slug: index % 2 ? "systems" : "practice", name: index % 2 ? "Systems" : "Practice", properties: {} },
      { slug: "mock", name: "Mock", properties: { generated: true } },
    ],
    ...overrides,
  };
}

export const mockEssays = Array.from({ length: 100 }, (_, index) => contentRecord("article", index));
export const mockThoughts = Array.from({ length: 100 }, (_, index) => contentRecord("thought", index));
export const mockGalleries = Array.from({ length: 100 }, (_, index) => contentRecord("gallery", index, {
  tags: [
    { slug: "media", name: "Media", properties: { kind: "mixed", item_count: 4 } },
    { slug: "mock", name: "Mock", properties: { generated: true } },
  ],
}));
export const mockVideos = Array.from({ length: 100 }, (_, index) => contentRecord("video", index, {
  tags: [
    { slug: "media", name: "Media", properties: { kind: "video", url: "", item_count: 1 } },
    { slug: "mock", name: "Mock", properties: { generated: true } },
  ],
}));
export const mockFootprints = Array.from({ length: 100 }, (_, index) => {
  const longitude = -170 + ((index * 43) % 340);
  const latitude = -54 + ((index * 29) % 108);
  const base = contentRecord("article", index, {
    id: `mock-footprint-${pad(index + 1)}`,
    slug: `mock-footprint-${pad(index + 1)}`,
    title: `Field note · Coordinate ${pad(index + 1)}`,
    summary: "A generated geographic field note linked to typed footprint properties.",
  });
  return {
    ...base,
    tags: [
      { slug: "footprint", name: "Footprint", properties: { latitude, longitude, location_name: `Coordinate ${pad(index + 1)}` } },
      { slug: "mock", name: "Mock", properties: { generated: true } },
    ],
  };
});

export const mockKnowledgeBases = Array.from({ length: 100 }, (_, index) => ({
  id: `mock-kb-${pad(index + 1)}`,
  slug: `mock-knowledge-${pad(index + 1)}`,
  title: `Knowledge Field Manual ${pad(index + 1)}`,
  description: "A generated document collection for catalog, search, and responsive reader testing.",
  coverUrl: "",
  visibility: "public",
  position: (index + 1) * 10,
}));

export const mockKnowledgePages = Array.from({ length: 100 }, (_, index) => {
  const baseIndex = index % 10;
  const base = mockKnowledgeBases[baseIndex];
  const pageIndex = Math.floor(index / 10);
  const title = `Document ${pad(index + 1)} · Calm systems`;
  return {
    id: `mock-kp-${pad(index + 1)}`,
    knowledgeBaseId: base.id,
    knowledgeBaseSlug: base.slug,
    slug: `document-${pad(index + 1)}`,
    title,
    summary: "A generated knowledge page with a multi-level Markdown outline.",
    parentId: pageIndex > 0 && pageIndex % 3 === 0 ? `mock-kp-${pad(baseIndex + 1)}` : "",
    position: (pageIndex + 1) * 10,
    status: "published",
    visibility: "public",
    bodyMarkdown: markdown(title, index, "knowledge page"),
  };
});

export const mockContents = [
  ...mockEssays,
  ...mockThoughts,
  ...mockGalleries,
  ...mockVideos,
  ...mockFootprints,
  ...mockKnowledgeBases.map((base) => ({
    id: base.id,
    type: "knowledge_base",
    slug: `knowledge-base--${base.id}`,
    knowledgeBaseSlug: base.slug,
    title: base.title,
    summary: base.description,
    status: "published",
    visibility: base.visibility,
    publishedAt: publishedAt(Number(base.position / 10) - 1),
    tags: [],
  })),
  ...mockKnowledgePages.map((page, index) => ({
    ...page,
    type: "knowledge_page",
    slug: `knowledge-page--${page.id}`,
    knowledgePageSlug: page.slug,
    knowledgeBaseTitle: mockKnowledgeBases.find((base) => base.id === page.knowledgeBaseId)?.title,
    publishedAt: publishedAt(index),
    tags: [],
  })),
];

export const mockMedia = Array.from({ length: 100 }, (_, index) => {
  const image = index % 2 === 0;
  return {
    id: `mock-media-${pad(index + 1)}`,
    originalName: `${image ? "image" : "video"}-${pad(index + 1)}.${image ? "webp" : "mp4"}`,
    objectKey: `mock/${image ? "images" : "videos"}/${pad(index + 1)}`,
    contentType: image ? "image/webp" : "video/mp4",
    sizeBytes: 240000 + index * 8192,
    url: `/media/mock-${pad(index + 1)}`,
    createdAt: publishedAt(index),
  };
});
