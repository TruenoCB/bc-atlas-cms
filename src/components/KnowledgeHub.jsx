import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Books,
  CaretDown,
  CaretLeft,
  CaretRight,
  FileText,
  FolderSimple,
  LockKey,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import {
  createKnowledgeBase,
  createKnowledgePage,
  deleteKnowledgeBase,
  deleteKnowledgePage,
  getKnowledgePage,
  listKnowledgeBases,
  listKnowledgePages,
  updateKnowledgeBase,
  updateKnowledgePage,
  uploadMedia,
} from "../lib/api.js";
import { PrimarySpecularButton } from "./SpecularButton.jsx";
import { CardSwap, SwapCard } from "./CardSwap.jsx";
import { resolveMarkdownCover } from "../lib/contentMedia.js";
import { MarkdownContent } from "./MarkdownContent.jsx";

const initialPageEditor = {
  parentId: "",
  title: "",
  slug: "",
  summary: "",
  position: 10,
  status: "draft",
  visibility: "public",
  bodyMarkdown: "",
};

const initialBaseEditor = { title: "", slug: "", description: "", coverUrl: "", visibility: "public", position: 10 };

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function headingSlug(value) {
  return slugify(String(value).replace(/[`*_]/g, "")) || "section";
}

function extractToc(markdown = "") {
  return markdown.split("\n").flatMap((line) => {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (!match) return [];
    return [{ depth: match[1].length, title: match[2].replace(/[`*_]/g, ""), id: headingSlug(match[2]) }];
  });
}

function treeFromPages(pages) {
  const children = new Map();
  pages.forEach((page) => {
    const key = page.parentId || "root";
    children.set(key, [...(children.get(key) ?? []), page]);
  });
  children.forEach((items) => items.sort((left, right) => left.position - right.position || left.title.localeCompare(right.title)));
  return children;
}

function PageTree({ childrenMap, parentId = "root", selectedId, openNodes, onToggle, onSelect, depth = 0 }) {
  return (childrenMap.get(parentId) ?? []).map((page) => {
    const children = childrenMap.get(page.id) ?? [];
    const open = openNodes.has(page.id);
    return (
      <div className="knowledge-tree-branch" key={page.id}>
        <div className={`knowledge-tree-row${selectedId === page.id ? " selected" : ""}`} style={{ "--tree-depth": depth }}>
          {children.length ? (
            <button className="knowledge-tree-toggle" type="button" aria-label={open ? `Collapse ${page.title}` : `Expand ${page.title}`} onClick={() => onToggle(page.id)}>
              {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
            </button>
          ) : <span className="knowledge-tree-spacer" />}
          <button className="knowledge-tree-page" type="button" onClick={() => onSelect(page)}>
            {children.length ? <FolderSimple size={14} /> : <FileText size={14} />}
            <span>{page.title}</span>
            {page.locked ? <LockKey size={12} /> : null}
          </button>
        </div>
        {children.length && open ? <PageTree childrenMap={childrenMap} parentId={page.id} selectedId={selectedId} openNodes={openNodes} onToggle={onToggle} onSelect={onSelect} depth={depth + 1} /> : null}
      </div>
    );
  });
}

function KnowledgeBaseEditorDialog({ open, mode, value, saving, onChange, onClose, onSubmit, onCoverUpload, onDelete }) {
  if (!open) return null;
  const editing = mode === "edit";
  return (
    <div className="dialog-backdrop knowledge-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="knowledge-editor knowledge-base-editor" onSubmit={onSubmit}>
        <header><div><div className="eyebrow">KNOWLEDGE / COLLECTION</div><h2>{editing ? "Edit knowledge base" : "New knowledge base"}</h2></div><button type="button" aria-label="Close editor" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-editor-grid">
          <label><span>Title</span><input required value={value.title} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value, slug: current.slug || slugify(event.target.value) }))} /></label>
          <label><span>Slug</span><input required value={value.slug} onChange={(event) => onChange((current) => ({ ...current, slug: slugify(event.target.value) }))} /></label>
          <label className="full"><span>Description</span><textarea rows="4" value={value.description} onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="full knowledge-cover-upload"><span>Title image · optional</span><div><UploadSimple size={15} /><input type="file" accept="image/*" onChange={onCoverUpload} /><em>{value.coverUrl ? "Cover stored in S3" : "Upload cover image"}</em></div></label>
          <label><span>Visibility</span><select value={value.visibility} onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Public</option><option value="members">Members</option><option value="private">Private</option></select></label>
          <label><span>Order</span><input type="number" value={value.position} onChange={(event) => onChange((current) => ({ ...current, position: event.target.value }))} /></label>
        </div>
        <footer>{editing ? <button className="knowledge-delete-action" type="button" onClick={onDelete} disabled={saving}><Trash size={14} />Delete knowledge base</button> : <span />}<PrimarySpecularButton type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save knowledge base" : "Create knowledge base"}</PrimarySpecularButton></footer>
      </form>
    </div>
  );
}

function KnowledgePageEditorDialog({ open, mode, value, pages, saving, onChange, onClose, onSubmit, onMediaUpload, onDelete }) {
  if (!open) return null;
  const editing = mode === "edit";
  return (
    <div className="dialog-backdrop knowledge-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="knowledge-editor knowledge-page-editor" onSubmit={onSubmit}>
        <header><div><div className="eyebrow">KNOWLEDGE / DOCUMENT</div><h2>{editing ? "Edit document" : "New document"}</h2></div><button type="button" aria-label="Close editor" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-editor-grid">
          <label><span>Title</span><input required value={value.title} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value, slug: current.slug || slugify(event.target.value) }))} /></label>
          <label><span>Slug</span><input required value={value.slug} onChange={(event) => onChange((current) => ({ ...current, slug: slugify(event.target.value) }))} /></label>
          <label><span>Parent page</span><select value={value.parentId} onChange={(event) => onChange((current) => ({ ...current, parentId: event.target.value }))}><option value="">Top level</option>{pages.filter((page) => page.id !== value.id).map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label>
          <label><span>Order</span><input type="number" value={value.position} onChange={(event) => onChange((current) => ({ ...current, position: event.target.value }))} /></label>
          <label className="full"><span>Summary</span><input value={value.summary} onChange={(event) => onChange((current) => ({ ...current, summary: event.target.value }))} /></label>
          <label><span>Visibility</span><select value={value.visibility} onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Public</option><option value="members">Members</option><option value="private">Private</option></select></label>
          <label><span>Status</span><select value={value.status} onChange={(event) => onChange((current) => ({ ...current, status: event.target.value }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
          <section className="knowledge-source-preview full" aria-label="Markdown source and preview">
            <header><span>MARKDOWN SOURCE</span><span>LIVE PREVIEW</span></header>
            <div>
              <textarea value={value.bodyMarkdown} onChange={(event) => onChange((current) => ({ ...current, bodyMarkdown: event.target.value }))} placeholder="Write in Markdown. GFM, LaTex, S3 media, and html-sandbox blocks are supported." />
              <div className="knowledge-live-preview markdown-body"><MarkdownContent body={value.bodyMarkdown} /></div>
            </div>
          </section>
        </div>
        <footer><label className="knowledge-upload"><UploadSimple size={15} />Attach image or video<input type="file" accept="image/*,video/*" onChange={onMediaUpload} /></label>{editing ? <button className="knowledge-delete-action" type="button" onClick={onDelete} disabled={saving}><Trash size={14} />Delete</button> : null}<PrimarySpecularButton type="submit" disabled={saving}>{saving ? "Saving…" : value.status === "draft" ? "Save draft" : "Save document"}</PrimarySpecularButton></footer>
      </form>
    </div>
  );
}

export function KnowledgeHub({ user, onRequireAuth, initialBaseSlug = "", initialPageSlug = "", startEditing = false, onWorkspaceChange }) {
  const [bases, setBases] = useState([]);
  const [baseAutoCovers, setBaseAutoCovers] = useState({});
  const [view, setView] = useState(initialBaseSlug ? "reader" : "catalog");
  const [baseSlug, setBaseSlug] = useState(initialBaseSlug);
  const [pages, setPages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [openNodes, setOpenNodes] = useState(new Set());
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogActiveIndex, setCatalogActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [pageEditorOpen, setPageEditorOpen] = useState(false);
  const [pageEditorMode, setPageEditorMode] = useState("create");
  const [pageEditor, setPageEditor] = useState(initialPageEditor);
  const [baseEditorOpen, setBaseEditorOpen] = useState(false);
  const [baseEditorMode, setBaseEditorMode] = useState("create");
  const [baseEditor, setBaseEditor] = useState(initialBaseEditor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const catalogListRef = useRef(null);
  const catalogItemRefs = useRef([]);
  const pendingEditRef = useRef(startEditing);

  const canPublish = ["editor", "admin"].includes(user?.role);
  const selectedBase = bases.find((item) => item.slug === baseSlug);
  const selectedPage = pages.find((item) => item.id === selectedId);
  const canManageBase = Boolean(selectedBase && (user?.role === "admin" || selectedBase.authorId === user?.id));
  const canManagePage = (page) => Boolean(page && (user?.role === "admin" || page.authorId === user?.id));

  const hydratePage = async (page) => {
    if (!page || page.locked) return page;
    const loaded = await getKnowledgePage(baseSlug, page.slug);
    setPages((current) => current.map((item) => item.id === loaded.id ? loaded : item));
    setSelectedId(loaded.id);
    return loaded;
  };

  const loadBases = async () => {
    const items = await listKnowledgeBases();
    setBases(items);
    Promise.all(items.map(async (base) => {
      const knowledgePages = await listKnowledgePages(base.slug);
      const cover = knowledgePages.map((page) => resolveMarkdownCover(page.bodyMarkdown)).find(Boolean) ?? "";
      return [base.slug, cover];
    })).then((entries) => setBaseAutoCovers(Object.fromEntries(entries))).catch(() => setBaseAutoCovers({}));
    return items;
  };

  useEffect(() => {
    loadBases().catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!initialBaseSlug) return;
    setBaseSlug(initialBaseSlug);
    setView("reader");
    pendingEditRef.current = startEditing;
  }, [initialBaseSlug, startEditing]);

  useEffect(() => {
    if (view !== "reader" || !baseSlug) return;
    listKnowledgePages(baseSlug).then(async (items) => {
      setPages(items);
      setOpenNodes(new Set(items.filter((item) => items.some((child) => child.parentId === item.id)).map((item) => item.id)));
      const candidate = items.find((item) => item.slug === initialPageSlug) ?? items[0];
      if (!candidate) {
        setSelectedId("");
        return;
      }
      try {
        const loaded = await getKnowledgePage(baseSlug, candidate.slug);
        setPages((current) => current.map((item) => item.id === loaded.id ? loaded : item));
        setSelectedId(loaded.id);
        if (pendingEditRef.current && canManagePage(loaded)) {
          pendingEditRef.current = false;
          setPageEditorMode("edit");
          setPageEditor({ ...initialPageEditor, ...loaded, sourceSlug: loaded.slug, position: loaded.position ?? 10 });
          setPageEditorOpen(true);
        }
      } catch (reason) {
        setError(reason.message);
      }
    }).catch((reason) => setError(reason.message));
  }, [baseSlug, view]);

  const filteredBases = useMemo(() => {
    const value = catalogQuery.trim().toLowerCase();
    if (!value) return bases;
    return bases.filter((base) => `${base.title} ${base.description ?? ""}`.toLowerCase().includes(value));
  }, [bases, catalogQuery]);
  const filteredBaseKey = filteredBases.map((base) => base.slug).join("|");
  const filteredPages = useMemo(() => {
    if (!query.trim()) return pages;
    const value = query.toLowerCase();
    return pages.filter((page) => `${page.title} ${page.summary} ${page.bodyMarkdown}`.toLowerCase().includes(value));
  }, [pages, query]);
  const childrenMap = useMemo(() => treeFromPages(query.trim() ? filteredPages.map((page) => ({ ...page, parentId: "" })) : filteredPages), [filteredPages, query]);
  const toc = useMemo(() => extractToc(selectedPage?.bodyMarkdown), [selectedPage]);

  useEffect(() => {
    setCatalogActiveIndex(0);
  }, [filteredBaseKey]);

  useEffect(() => {
    const container = catalogListRef.current;
    const item = catalogItemRefs.current[catalogActiveIndex];
    if (!container || !item) return;
    const top = item.offsetTop - (container.clientHeight - item.offsetHeight) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [catalogActiveIndex, filteredBaseKey]);

  const openBase = (base) => {
    setBaseSlug(base.slug);
    setPages([]);
    setSelectedId("");
    setQuery("");
    setView("reader");
  };

  const returnToCatalog = () => {
    pendingEditRef.current = false;
    setView("catalog");
    setQuery("");
  };

  const selectPage = async (page) => {
    if (page.locked) {
      onRequireAuth("Sign in to read this member-only knowledge page.");
      return;
    }
    try {
      await hydratePage(page);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const openPageEditor = async (page = null) => {
    if (!canPublish) return;
    try {
      if (page) {
        const loaded = await hydratePage(page);
        if (!canManagePage(loaded)) {
          setError("Only the author or an administrator can edit this document.");
          return;
        }
        setPageEditorMode("edit");
        setPageEditor({ ...initialPageEditor, ...loaded, sourceSlug: loaded.slug, position: loaded.position ?? 10 });
      } else {
        setPageEditorMode("create");
        setPageEditor({ ...initialPageEditor, position: pages.length ? Math.max(...pages.map((item) => item.position)) + 10 : 10 });
      }
      setPageEditorOpen(true);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const savePage = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = { ...pageEditor, position: Number(pageEditor.position) };
      const saved = pageEditorMode === "edit"
        ? await updateKnowledgePage(baseSlug, pageEditor.sourceSlug, input)
        : await createKnowledgePage(baseSlug, input);
      setPages((current) => pageEditorMode === "edit" ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setSelectedId(saved.id);
      if (saved.parentId) setOpenNodes((current) => new Set([...current, saved.parentId]));
      setPageEditorOpen(false);
      onWorkspaceChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const removePage = async () => {
    if (!window.confirm(`Delete “${pageEditor.title}”? Child pages must be moved or deleted first.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteKnowledgePage(baseSlug, pageEditor.sourceSlug);
      const remaining = pages.filter((page) => page.id !== pageEditor.id);
      setPages(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setPageEditorOpen(false);
      onWorkspaceChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const openBaseEditor = (base = null) => {
    if (base) {
      if (!(user?.role === "admin" || base.authorId === user?.id)) {
        setError("Only the author or an administrator can edit this knowledge base.");
        return;
      }
      setBaseEditorMode("edit");
      setBaseEditor({ ...initialBaseEditor, ...base, sourceSlug: base.slug });
    } else {
      setBaseEditorMode("create");
      setBaseEditor({ ...initialBaseEditor, position: bases.length ? Math.max(...bases.map((item) => item.position)) + 10 : 10 });
    }
    setBaseEditorOpen(true);
  };

  const saveBase = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = { ...baseEditor, position: Number(baseEditor.position) };
      const saved = baseEditorMode === "edit" ? await updateKnowledgeBase(baseEditor.sourceSlug, input) : await createKnowledgeBase(input);
      setBases((current) => baseEditorMode === "edit" ? current.map((base) => base.id === saved.id ? saved : base) : [...current, saved]);
      if (baseEditorMode === "edit" && baseSlug === baseEditor.sourceSlug) setBaseSlug(saved.slug);
      setBaseEditorOpen(false);
      onWorkspaceChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const removeBase = async () => {
    if (!window.confirm(`Delete “${baseEditor.title}” and every document inside it? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteKnowledgeBase(baseEditor.sourceSlug);
      setBases((current) => current.filter((base) => base.id !== baseEditor.id));
      setBaseEditorOpen(false);
      returnToCatalog();
      onWorkspaceChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const attachMedia = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const media = await uploadMedia(file);
      const label = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() || "Media";
      const syntax = file.type.startsWith("image/") ? `\n![${label}](${media.url})\n` : `\n[${label}](${media.url})\n`;
      setPageEditor((current) => ({ ...current, bodyMarkdown: `${current.bodyMarkdown}${syntax}` }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };

  const attachBaseCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const media = await uploadMedia(file);
      setBaseEditor((current) => ({ ...current, coverUrl: media.url }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  };

  if (view === "catalog") {
    return (
      <main className="knowledge-catalog">
        <div className="knowledge-catalog-toolbar"><div className="eyebrow">KNOWLEDGE / LIBRARIES</div>{canPublish ? <PrimarySpecularButton size="sm" onClick={() => openBaseEditor()}><Plus size={14} />New knowledge base</PrimarySpecularButton> : null}</div>
        <label className="knowledge-catalog-search specular-search"><MagnifyingGlass size={16} /><input aria-label="Search knowledge bases" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search knowledge bases" /><span>{filteredBases.length} / {bases.length}</span></label>
        <div className="knowledge-catalog-browser">
          <aside className="knowledge-catalog-index" aria-label="Knowledge base index"><header><div><span>LIBRARY INDEX</span><strong>{String(filteredBases.length).padStart(2, "0")}</strong></div><small>FOCUS FOLLOWS THE STACK</small></header><div className="knowledge-catalog-index-list" ref={catalogListRef} role="listbox" aria-label="Select a knowledge base">{filteredBases.map((base, index) => <button key={base.id} ref={(node) => { catalogItemRefs.current[index] = node; }} className={catalogActiveIndex === index ? "active" : ""} type="button" role="option" aria-selected={catalogActiveIndex === index} onClick={() => setCatalogActiveIndex(index)}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{base.title}</strong><small>{base.visibility.toUpperCase()} COLLECTION</small></span><CaretRight size={13} aria-hidden="true" /></button>)}{!filteredBases.length ? <p>No matching libraries.</p> : null}</div><footer aria-hidden="true"><span>{filteredBases.length ? String(catalogActiveIndex + 1).padStart(2, "0") : "00"}</span><span className="knowledge-catalog-index-progress"><span style={{ width: `${filteredBases.length ? ((catalogActiveIndex + 1) / filteredBases.length) * 100 : 0}%` }} /></span><span>{String(filteredBases.length).padStart(2, "0")}</span></footer></aside>
          <section className="knowledge-swap-stage" aria-label="Knowledge base catalog">{filteredBases.length ? <CardSwap key={filteredBaseKey} width="min(72vw, 680px)" height="min(58vh, 490px)" cardDistance={42} verticalDistance={38} activeIndex={catalogActiveIndex} onActiveChange={setCatalogActiveIndex} onCardClick={(index) => openBase(filteredBases[index])}>{filteredBases.map((base, index) => { const coverUrl = base.coverUrl || baseAutoCovers[base.slug]; return <SwapCard className="knowledge-base-card" key={base.id} role="button" tabIndex="0" aria-label={`Open ${base.title}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openBase(base); }}><div className={`knowledge-base-card-visual${coverUrl ? " has-cover" : ""}`} aria-hidden="true"><span className="knowledge-base-card-index">{String(index + 1).padStart(2, "0")}</span>{coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <Books size={54} weight="thin" />}<i /><i /><i /></div><div className="knowledge-base-card-copy"><div className="eyebrow">{base.visibility.toUpperCase()} COLLECTION</div><h2>{base.title}</h2><p>{base.description || "A growing collection of connected documents."}</p><span>Explore knowledge base <ArrowRight size={15} /></span></div></SwapCard>; })}</CardSwap> : <div className="knowledge-catalog-no-results">No knowledge bases match “{catalogQuery.trim()}”.</div>}</section>
        </div>
        {!bases.length && !error ? <div className="knowledge-catalog-empty">No knowledge bases have been published yet.</div> : null}
        <KnowledgeBaseEditorDialog open={baseEditorOpen} mode={baseEditorMode} value={baseEditor} saving={saving} onChange={setBaseEditor} onClose={() => setBaseEditorOpen(false)} onSubmit={saveBase} onCoverUpload={attachBaseCover} onDelete={removeBase} />
        {error ? <div className="toast" role="status">{error}</div> : null}
      </main>
    );
  }

  return (
    <main className="knowledge-shell">
      <aside className="knowledge-sidebar"><div className="knowledge-sidebar-head"><button className="knowledge-back" type="button" onClick={returnToCatalog}><CaretLeft size={13} />All knowledge bases</button><div className="eyebrow">KNOWLEDGE BASE</div><div className="knowledge-base-current"><h2>{selectedBase?.title}</h2>{canPublish ? <div>{canManageBase ? <button type="button" aria-label="Edit knowledge base" title="Edit knowledge base" onClick={() => openBaseEditor(selectedBase)}><PencilSimple size={14} /></button> : null}<button type="button" aria-label="Create knowledge base" title="Create knowledge base" onClick={() => openBaseEditor()}><Plus size={14} /></button></div> : null}</div><p>{selectedBase?.description}</p></div><label className="knowledge-search specular-search"><MagnifyingGlass size={15} /><input aria-label="Search this knowledge base" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this knowledge base" /></label><nav className="knowledge-tree" aria-label="Knowledge pages"><PageTree childrenMap={childrenMap} selectedId={selectedId} openNodes={openNodes} onToggle={(id) => setOpenNodes((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={selectPage} />{!filteredPages.length ? <p className="knowledge-empty">No pages match this search.</p> : null}</nav>{canPublish ? <button className="knowledge-new-page" type="button" onClick={() => openPageEditor()}><Plus size={14} />New page</button> : null}</aside>
      <article className="knowledge-document">{selectedPage ? <><div className="knowledge-breadcrumb"><span>{selectedBase?.title}</span><CaretRight size={12} /><span>{selectedPage.title}</span></div><div className="knowledge-title"><div className="knowledge-title-actions"><div className="eyebrow">DOCUMENT / {String(selectedPage.position).padStart(2, "0")}</div>{canManagePage(selectedPage) ? <button type="button" onClick={() => openPageEditor(selectedPage)}><PencilSimple size={14} />Edit</button> : null}</div><h1>{selectedPage.title}</h1><p>{selectedPage.summary}</p></div><div className="knowledge-markdown"><MarkdownContent body={selectedPage.bodyMarkdown} className="knowledge-markdown-content" /></div></> : <div className="knowledge-placeholder">Select a knowledge page.</div>}</article>
      <aside className="knowledge-toc"><div className="eyebrow">ON THIS PAGE</div>{toc.map((item) => <a className={item.depth === 3 ? "nested" : ""} key={`${item.id}-${item.title}`} href={`#${item.id}`}>{item.title}</a>)}{!toc.length ? <span>No subsections</span> : null}</aside>
      <KnowledgePageEditorDialog open={pageEditorOpen} mode={pageEditorMode} value={pageEditor} pages={pages} saving={saving} onChange={setPageEditor} onClose={() => setPageEditorOpen(false)} onSubmit={savePage} onMediaUpload={attachMedia} onDelete={removePage} />
      <KnowledgeBaseEditorDialog open={baseEditorOpen} mode={baseEditorMode} value={baseEditor} saving={saving} onChange={setBaseEditor} onClose={() => setBaseEditorOpen(false)} onSubmit={saveBase} onCoverUpload={attachBaseCover} onDelete={removeBase} />
      {error ? <div className="toast" role="status">{error}</div> : null}
    </main>
  );
}
