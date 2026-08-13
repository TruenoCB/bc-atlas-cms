import { seedFootprints } from "../data/seedFootprints.js";
import { seedContents } from "../data/seedContents.js";
import { seedKnowledgeBases, seedKnowledgePages } from "../data/seedKnowledge.js";

const STORAGE_KEY = "bc.cms.footprints.v1";

function readLocalFootprints() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : seedFootprints;
  } catch {
    return seedFootprints;
  }
}

function writeLocalFootprints(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? `Request failed with ${response.status}`, response.status);
  return payload;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function listFootprints() {
  try {
    const payload = await request("/api/footprints");
    return payload.items ?? payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return readLocalFootprints();
  }
}

export async function getContent(slug) {
  return request(`/api/contents/${encodeURIComponent(slug)}`);
}

export async function listContents(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  try {
    const payload = await request(`/api/contents${query.size ? `?${query}` : ""}`);
    return payload.items ?? [];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return seedContents.filter((item) => (!filters.type || item.type === filters.type)
      && (!filters.tag || item.tags?.some((tag) => tag.slug === filters.tag))
      && (!filters.status || filters.status === "all" || item.status === filters.status));
  }
}

export async function createContent(input) {
  return request("/api/contents", { method: "POST", body: JSON.stringify(input) });
}

export async function updateContent(slug, input) {
  return request(`/api/contents/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteContent(slug) {
  return request(`/api/contents/${encodeURIComponent(slug)}`, { method: "DELETE", body: "{}" });
}

export async function listComments(slug) {
  const payload = await request(`/api/contents/${encodeURIComponent(slug)}/comments`);
  return payload.items ?? [];
}

export async function createComment(slug, body, authorDisplayName = "", website = "") {
  return request(`/api/contents/${encodeURIComponent(slug)}/comments`, { method: "POST", body: JSON.stringify({ body, authorDisplayName, website }) });
}

export async function uploadMedia(file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/media", { method: "POST", body, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? `Upload failed with ${response.status}`, response.status);
  return payload;
}

export async function createFootprint(input) {
  const payload = {
    type: "article",
    title: input.title,
    slug: input.slug,
    summary: input.summary,
    bodyMarkdown: input.bodyMarkdown,
    visibility: input.visibility,
    tags: [
      {
        slug: "footprint",
        name: "Footprint",
        properties: {
          latitude: Number(input.latitude),
          longitude: Number(input.longitude),
          location_name: input.locationName,
        },
      },
      ...input.tags.map((tag) => ({ slug: tag, name: tag, properties: {} })),
    ],
  };

  const created = await request("/api/contents", { method: "POST", body: JSON.stringify(payload) });
  writeLocalFootprints([created, ...readLocalFootprints().filter((item) => item.id !== created.id)]);
  return created;
}

export async function getSession() {
  const payload = await request("/api/auth/me");
  return payload.user ?? null;
}

export async function login(input) {
  const payload = await request("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
  return payload.user;
}

export async function register(input) {
  const payload = await request("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  return payload.user;
}

export async function logout() {
  await request("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function listKnowledgeBases() {
  try {
    const payload = await request("/api/knowledge-bases");
    return payload.items?.length ? payload.items : seedKnowledgeBases;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return seedKnowledgeBases;
  }
}

export async function createKnowledgeBase(input) {
  return request("/api/knowledge-bases", { method: "POST", body: JSON.stringify(input) });
}

export async function listKnowledgePages(baseSlug) {
  try {
    const payload = await request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages`);
    return payload.items?.length ? payload.items : (seedKnowledgePages[baseSlug] ?? []);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return seedKnowledgePages[baseSlug] ?? [];
  }
}

export async function createKnowledgePage(baseSlug, input) {
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateKnowledgePage(baseSlug, pageSlug, input) {
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages/${encodeURIComponent(pageSlug)}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteKnowledgePage(baseSlug, pageSlug) {
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages/${encodeURIComponent(pageSlug)}`, { method: "DELETE", body: "{}" });
}
