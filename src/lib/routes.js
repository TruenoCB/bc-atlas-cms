const viewPaths = {
  Home: "/",
  Essays: "/essays",
  Thoughts: "/thoughts",
  Knowledge: "/knowledge",
  Gallery: "/gallery",
  "Field Notes": "/field-notes",
  Workspace: "/workspace",
  "Media Library": "/workspace/media",
};

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function routeForView(view) {
  return viewPaths[view] ?? "/";
}

export function viewForContent(content) {
  if (content?.tags?.some((tag) => tag.slug === "footprint")) return "Field Notes";
  if (content?.type === "thought") return "Thoughts";
  if (content?.type === "gallery" || content?.type === "video") return "Gallery";
  return "Essays";
}

export function routeForContent(content) {
  return `${routeForView(viewForContent(content))}/${encodeURIComponent(content.slug)}`;
}

export function routeForKnowledge(baseSlug = "", pageSlug = "") {
  if (!baseSlug) return "/knowledge";
  const base = `/knowledge/${encodeURIComponent(baseSlug)}`;
  return pageSlug ? `${base}/${encodeURIComponent(pageSlug)}` : base;
}

export function parseAppRoute(pathname = "/") {
  const parts = pathname.split("/").filter(Boolean).map(safeDecode);
  if (!parts.length) return { view: "Home", contentSlug: "", baseSlug: "", pageSlug: "" };

  if (parts[0] === "knowledge") {
    return { view: "Knowledge", contentSlug: "", baseSlug: parts[1] ?? "", pageSlug: parts[2] ?? "" };
  }
  if (parts[0] === "workspace") {
    return { view: parts[1] === "media" ? "Media Library" : "Workspace", contentSlug: "", baseSlug: "", pageSlug: "" };
  }

  const contentViews = {
    essays: "Essays",
    articles: "Essays",
    thoughts: "Thoughts",
    gallery: "Gallery",
    "field-notes": "Field Notes",
  };
  const contentView = contentViews[parts[0]];
  if (contentView) return { view: contentView, contentSlug: parts[1] ?? "", baseSlug: "", pageSlug: "" };

  return { view: "Home", contentSlug: "", baseSlug: "", pageSlug: "" };
}
