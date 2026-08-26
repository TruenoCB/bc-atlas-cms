export function markdownHeadingSlug(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "") || "section";
}

function plainHeadingText(value) {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

export function uniqueMarkdownHeadingId(title, counts) {
  const base = markdownHeadingSlug(title);
  const occurrence = counts.get(base) ?? 0;
  counts.set(base, occurrence + 1);
  return occurrence ? `${base}-${occurrence + 1}` : base;
}

export function extractMarkdownToc(markdown = "", { minDepth = 2, maxDepth = 4 } = {}) {
  const counts = new Map();
  let fenced = false;

  return String(markdown).split("\n").flatMap((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];

    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return [];
    const depth = match[1].length;
    if (depth < minDepth || depth > maxDepth) return [];
    const title = plainHeadingText(match[2]);
    if (!title) return [];
    return [{ depth, title, id: uniqueMarkdownHeadingId(title, counts) }];
  });
}
