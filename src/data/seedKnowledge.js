export const seedKnowledgeBases = [
  { id: "kb-systems", slug: "systems-field-manual", title: "Systems Field Manual", description: "Calm infrastructure, observability, and practical AI engineering.", coverUrl: "", visibility: "public", position: 10 },
  { id: "kb-practice", slug: "practice-notes", title: "Practice Notes", description: "Training systems, recovery, and deliberate repetition.", visibility: "public", position: 20 },
];

export const seedKnowledgePages = {
  "systems-field-manual": [
    {
      id: "kp-systems-intro", knowledgeBaseId: "kb-systems", slug: "start-here", title: "Start here", summary: "How to use this field manual.", parentId: "", position: 10, status: "published", visibility: "public",
      bodyMarkdown: `# Systems Field Manual

A connected guide to building software that stays understandable under pressure.

## How this guide is organized

Each entry can have ordered child pages. Images use ordinary Markdown, videos use a linked media file, and small interactive demonstrations live in sandboxed HTML blocks.

## A working principle

$$\\text{operability} = \\frac{\\text{clarity} \\times \\text{recovery}}{\\text{hidden coupling} + 1}$$`,
    },
    {
      id: "kp-calm-root", knowledgeBaseId: "kb-systems", slug: "calm-systems", title: "Calm systems", summary: "A chapter about visible recovery paths.", parentId: "", position: 20, status: "published", visibility: "public",
      bodyMarkdown: `# Calm systems

Calmness is an operational property: the next useful action is visible.

## Bound the failure

Prefer small failure domains and explicit recovery paths.

## Make state legible

A dashboard is useful only when its state leads to a decision.`,
    },
    {
      id: "kp-observability", knowledgeBaseId: "kb-systems", parentId: "kp-calm-root", slug: "observability", title: "Observability", summary: "Signals that support decisions.", position: 10, status: "published", visibility: "public",
      bodyMarkdown: `# Observability

Collect signals that answer a question, not signals that merely fill a chart.

## Logs

Keep events structured and attach stable identifiers.

## Metrics

Measure work, saturation, errors, and latency before decorative totals.`,
    },
    {
      id: "kp-rag-root", knowledgeBaseId: "kb-systems", parentId: "", slug: "ai-retrieval", title: "AI retrieval", summary: "Notes on retrieval systems and evaluation.", position: 30, status: "published", visibility: "public",
      bodyMarkdown: `# AI retrieval

Retrieval quality depends on the document model before it depends on the vector store.

## Keep source boundaries

Store document and section identities with every chunk.

## Evaluate the path

Measure retrieval coverage separately from answer quality.

### Tiny interactive example

The block below runs in an isolated iframe with no access to the CMS session.

\`\`\`html-sandbox
<button id="toggle">Show retrieval note</button>
<p id="note" hidden>Keep the source document and section ID beside every chunk.</p>
<script>
  document.querySelector('#toggle').onclick = () => {
    document.querySelector('#note').hidden = false;
  };
</script>
\`\`\``,
    },
  ],
  "practice-notes": [
    {
      id: "kp-practice-intro", knowledgeBaseId: "kb-practice", parentId: "", slug: "training-system", title: "Training system", summary: "A compact system for consistent practice.", position: 10, status: "published", visibility: "public",
      bodyMarkdown: `# Training system

Skill grows through repeatable sessions, honest feedback, and enough recovery to return.

## Session shape

Warm up, isolate one variable, apply it under pressure, and write the observation down.

## Review

Record one adjustment for the next session.`,
    },
  ],
};
