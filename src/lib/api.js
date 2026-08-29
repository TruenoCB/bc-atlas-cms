import { seedFootprints } from "../data/seedFootprints.js";
import { seedContents } from "../data/seedContents.js";
import { seedKnowledgeBases, seedKnowledgePages } from "../data/seedKnowledge.js";
import {
  mockContents,
  mockFootprints,
  mockKnowledgeBases,
  mockKnowledgePages,
  mockMedia,
} from "../data/mockCms.js";

const STORAGE_KEY = "bc.cms.footprints.v1";
// Seed records make the standalone Vite experience useful, but they must never
// masquerade as a live site's data when a production API is unavailable.
const allowDemoFallback = import.meta.env.DEV;
const mockEnabled = import.meta.env.VITE_MOCK_DATA === "true";
let mockMediaState = [...mockMedia];

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
  if (mockEnabled) return mockFootprints;
  try {
    const payload = await request("/api/footprints");
    return payload.items ?? payload;
  } catch (error) {
    if (error instanceof ApiError || !allowDemoFallback) throw error;
    return readLocalFootprints();
  }
}

export async function getContent(slug) {
  if (mockEnabled) {
    const item = mockContents.find((content) => content.slug === slug);
    if (!item) throw new ApiError("Content not found", 404);
    return item;
  }
  return request(`/api/contents/${encodeURIComponent(slug)}`);
}

export async function listContents(filters = {}) {
  if (mockEnabled) return mockContents.filter((item) => (!filters.type || item.type === filters.type)
    && (!filters.tag || item.tags?.some((tag) => tag.slug === filters.tag))
    && (!filters.status || filters.status === "all" || item.status === filters.status));
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  try {
    const payload = await request(`/api/contents${query.size ? `?${query}` : ""}`);
    return payload.items ?? [];
  } catch (error) {
    if (error instanceof ApiError || !allowDemoFallback) throw error;
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
  if (mockEnabled) return [];
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

export async function listMedia(filters = {}) {
  return (await listMediaPage(filters)).items;
}

export async function listMediaPage(filters = {}) {
  if (mockEnabled) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.max(1, Number(filters.pageSize) || 100);
    const needle = String(filters.query || filters.search || "").trim().toLowerCase();
    const filtered = needle ? mockMediaState.filter((item) => `${item.originalName} ${item.objectKey} ${item.contentType}`.toLowerCase().includes(needle)) : mockMediaState;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: filtered.length, totalPages } };
  }
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const payload = await request(`/api/media${query.size ? `?${query}` : ""}`);
  return {
    items: payload.items ?? [],
    pagination: payload.pagination ?? { page: Number(filters.page) || 1, pageSize: 100, total: payload.items?.length ?? 0, totalPages: 1 },
  };
}

export async function deleteMedia(id) {
  if (mockEnabled) {
    mockMediaState = mockMediaState.filter((item) => item.id !== id);
    return null;
  }
  return request(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
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
  if (mockEnabled) return null;
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
  if (mockEnabled) return mockKnowledgeBases;
  try {
    const payload = await request("/api/knowledge-bases");
    return payload.items ?? [];
  } catch (error) {
    if (error instanceof ApiError || !allowDemoFallback) throw error;
    return seedKnowledgeBases;
  }
}

export async function createKnowledgeBase(input) {
  return request("/api/knowledge-bases", { method: "POST", body: JSON.stringify(input) });
}

export async function getKnowledgeBase(baseSlug) {
  if (mockEnabled) {
    const item = mockKnowledgeBases.find((base) => base.slug === baseSlug);
    if (!item) throw new ApiError("Knowledge base not found", 404);
    return item;
  }
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}`);
}

export async function updateKnowledgeBase(baseSlug, input) {
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteKnowledgeBase(baseSlug) {
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}`, { method: "DELETE", body: "{}" });
}

export async function listKnowledgePages(baseSlug) {
  if (mockEnabled) return mockKnowledgePages.filter((page) => page.knowledgeBaseSlug === baseSlug);
  try {
    const payload = await request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages`);
    return payload.items ?? [];
  } catch (error) {
    if (error instanceof ApiError || !allowDemoFallback) throw error;
    return seedKnowledgePages[baseSlug] ?? [];
  }
}

export async function getKnowledgePage(baseSlug, pageSlug) {
  if (mockEnabled) {
    const item = mockKnowledgePages.find((page) => page.knowledgeBaseSlug === baseSlug && page.slug === pageSlug);
    if (!item) throw new ApiError("Knowledge page not found", 404);
    return item;
  }
  return request(`/api/knowledge-bases/${encodeURIComponent(baseSlug)}/pages/${encodeURIComponent(pageSlug)}`);
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
