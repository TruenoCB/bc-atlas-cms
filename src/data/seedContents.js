import { seedFootprints } from "./seedFootprints.js";

export const seedContents = [
  {
    id: "essay-calm-systems",
    type: "article",
    slug: "building-calm-systems",
    title: "Building calm systems in a noisy world",
    summary: "Notes on software, infrastructure, and deliberate practice.",
    bodyMarkdown: `# Building calm systems in a noisy world

Reliable systems are less about removing every failure than making the next useful action obvious. A calm system can be under pressure without transferring that pressure to every person operating it.

## Calm is an operational property

Calmness does not mean silence. It means the system exposes enough state for a person to decide what to do next. Healthy paths, degraded paths, and recovery paths should be visible without reconstructing the entire architecture from logs.

The useful question is not whether a component can fail. It is whether that failure remains bounded, legible, and recoverable.

## Design the recovery path first

Teams often spend most of their design time on the successful request path. Production teaches the inverse lesson: recovery deserves the clearest interface.

### Bound the failure domain

Prefer small failure domains, explicit timeouts, idempotent retries, and state transitions that can be inspected. A dependency should not be able to consume unbounded time, memory, or attention.

### Make the next action visible

An alert should carry a decision, not only a measurement. Connect the signal to the affected user path, the current owner, and the safest reversible action.

## A working rule

Prefer bounded complexity, visible recovery, and interfaces that respect attention.

$$
\text{calm} = \frac{\text{clarity} \times \text{recovery}}{\text{noise} + 1}
$$

This is not a literal reliability equation. It is a reminder that more telemetry does not automatically produce more understanding. Clarity and recovery multiply each other; noise taxes both.

## What to review before shipping

1. Identify the smallest unit that can fail independently.
2. Decide how operators will recognize the failure.
3. Define one reversible recovery action.
4. Record the event with stable identifiers.
5. Test the degraded path before production traffic does.

The goal is not a system that never surprises you. The goal is a system whose surprises remain discussable.`,
    status: "published",
    visibility: "public",
    publishedAt: "2026-08-01T09:00:00Z",
    tags: [
      { slug: "infrastructure", name: "Infrastructure", properties: {} },
      { slug: "ai", name: "AI", properties: {} },
    ],
  },
  {
    id: "essay-interface-boundaries",
    type: "article",
    slug: "interface-boundaries-in-production",
    title: "Interface boundaries in production",
    summary: "Why the seams between services deserve more design attention than their internals.",
    bodyMarkdown: "# Interface boundaries in production\n\nThe most expensive production failures often live between components.\n\n## Design the contract\n\nMake timeouts, ownership, versioning, and recovery behavior explicit.\n\n## Observe the seam\n\nMeasure handoffs, not only isolated components.",
    status: "published",
    visibility: "public",
    publishedAt: "2026-06-14T10:00:00Z",
    tags: [
      { slug: "infrastructure", name: "Infrastructure", properties: {} },
      { slug: "systems", name: "Systems", properties: {} },
    ],
  },
  {
    id: "essay-retrieval-pipelines",
    type: "article",
    slug: "notes-on-retrieval-pipelines",
    title: "Notes on retrieval pipelines",
    summary: "Document boundaries, evaluation, and the work that matters before choosing a vector store.",
    bodyMarkdown: "# Notes on retrieval pipelines\n\nRetrieval quality begins with a legible document model.\n\n## Preserve source structure\n\nKeep document and section identities beside every chunk.\n\n## Evaluate separately\n\nMeasure retrieval coverage before judging answer quality.",
    status: "published",
    visibility: "public",
    publishedAt: "2025-11-22T08:30:00Z",
    tags: [
      { slug: "ai", name: "AI", properties: {} },
      { slug: "retrieval", name: "Retrieval", properties: {} },
    ],
  },
  {
    id: "essay-debug-before-optimize",
    type: "article",
    slug: "debug-before-you-optimize",
    title: "Debug before you optimize",
    summary: "A small field guide for separating evidence, hypotheses, and performance work.",
    bodyMarkdown: "# Debug before you optimize\n\nOptimization without a model is only movement.\n\n## Build the timeline\n\nPut events in order before assigning causes.\n\n## Change one variable\n\nMake the smallest reversible experiment that can disprove the current hypothesis.",
    status: "published",
    visibility: "public",
    publishedAt: "2025-08-08T12:00:00Z",
    tags: [
      { slug: "systems", name: "Systems", properties: {} },
      { slug: "practice", name: "Practice", properties: {} },
    ],
  },
  {
    id: "thought-visible-complexity",
    type: "thought",
    slug: "make-complexity-visible",
    title: "Make complexity visible before making it clever",
    summary: "A short note about observability as a design property.",
    bodyMarkdown: "Complexity that can be seen can be discussed, measured, and reduced. Cleverness that hides the system only compounds the cost of change.",
    status: "published",
    visibility: "public",
    publishedAt: "2026-07-30T11:00:00Z",
    tags: [{ slug: "systems", name: "Systems", properties: {} }],
  },
  {
    id: "gallery-road-work",
    type: "gallery",
    slug: "roads-between-rounds",
    title: "Roads between rounds",
    summary: "A media collection about training rooms, night roads, and the distance between familiar places.",
    bodyMarkdown: "# Roads between rounds\n\nThis gallery is ready for photographs and video uploaded to the S3 media library.",
    status: "published",
    visibility: "public",
    publishedAt: "2026-07-28T08:00:00Z",
    tags: [
      { slug: "media", name: "Media", properties: { kind: "mixed", item_count: 0 } },
      { slug: "boxing", name: "Boxing", properties: {} },
    ],
  },
  ...seedFootprints,
];
