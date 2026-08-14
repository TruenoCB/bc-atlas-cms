const markdownImagePattern = /!\[[^\]]*\]\((?:<)?([^\s)>]+)(?:>)?(?:\s+["'][^"']*["'])?\)/i;
const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i;

export function resolveContentCover(content) {
  if (!content) return null;
  const coverTag = content.tags?.find((tag) => tag.slug === "cover");
  const explicitUrl = String(coverTag?.properties?.url ?? "").trim();
  if (explicitUrl) {
    return {
      url: explicitUrl,
      alt: String(coverTag?.properties?.alt ?? content.title ?? "").trim(),
      source: "cover",
    };
  }

  const inline = resolveMarkdownCover(content.bodyMarkdown);
  if (inline) return { url: inline, alt: content.title ?? "", source: "first-image" };

  const media = content.tags?.find((tag) => tag.slug === "media" && String(tag.properties?.content_type ?? "").startsWith("image/"));
  const mediaUrl = String(media?.properties?.url ?? "").trim();
  return mediaUrl ? { url: mediaUrl, alt: content.title ?? "", source: "media" } : null;
}

export function resolveMarkdownCover(markdown = "") {
  const body = String(markdown);
  return body.match(markdownImagePattern)?.[1] ?? body.match(htmlImagePattern)?.[1] ?? "";
}

export function meaningfulContentTags(content) {
  return (content?.tags ?? []).filter((tag) => !["cover", "footprint", "media"].includes(tag.slug));
}
