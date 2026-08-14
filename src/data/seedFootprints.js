export const seedFootprints = [
  {
    id: "footprint-tokyo",
    slug: "field-note-tokyo",
    type: "article",
    title: "Interfaces for a moving city",
    summary: "A field note on public systems, rhythm, and the small details that keep a city legible.",
    bodyMarkdown: `# Interfaces for a moving city

Tokyo rewards attention. The useful lesson is not that every system must become denser; it is that complexity can remain calm when paths, signals, and recovery are designed together.

## A note to keep

Good infrastructure makes the next action visible without demanding attention. In software, I think of the same idea as reducing **decision latency** while preserving escape routes.

The footprint is stored as typed properties on the \`footprint\` tag, so the article remains a normal article everywhere else in the CMS.`,
    visibility: "public",
    publishedAt: "2026-05-18T09:00:00Z",
    tags: [
      {
        slug: "footprint",
        name: "Footprint",
        properties: {
          latitude: 35.6762,
          longitude: 139.6503,
          location_name: "Tokyo",
        },
      },
      { slug: "systems", name: "Systems", properties: {} },
    ],
  },
  {
    id: "footprint-paris",
    slug: "field-note-paris",
    type: "article",
    title: "A city built for long questions",
    summary: "Notes from Paris on research, distance, and choosing a direction without rushing the answer.",
    bodyMarkdown: `# A city built for long questions

Some places make unfinished thoughts feel welcome. Walking gave the day a slower clock and made one question easier to hold:

$$
\\text{direction} = \\frac{\\text{curiosity} \\times \\text{practice}}{\\text{noise} + 1}
$$

This is sample Markdown and LaTeX content for the publishing flow. Replace it with a real field note when the CMS is connected to your production database.`,
    visibility: "public",
    publishedAt: "2026-04-02T14:30:00Z",
    tags: [
      {
        slug: "footprint",
        name: "Footprint",
        properties: {
          latitude: 48.8566,
          longitude: 2.3522,
          location_name: "Paris",
        },
      },
      { slug: "research", name: "Research", properties: {} },
    ],
  },
];
