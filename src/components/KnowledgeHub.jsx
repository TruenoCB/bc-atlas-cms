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
  Plus,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { createKnowledgeBase, createKnowledgePage, listKnowledgeBases, listKnowledgePages, uploadMedia } from "../lib/api.js";
import { PrimarySpecularButton } from "./SpecularButton.jsx";
import { CardSwap, SwapCard } from "./CardSwap.jsx";
import { resolveMarkdownCover } from "../lib/contentMedia.js";
import { MarkdownContent } from "./MarkdownContent.jsx";

const initialEditor = {
  parentId: "",
  title: "",
  slug: "",
  summary: "",
  position: 10,
  status: "published",
  visibility: "public",
  bodyMarkdown: "Start writing here.\n\n## First section\n\nAdd the details.",
};

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
  children.forEach((items) => items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)));
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

function KnowledgeBaseEditorDialog({ open, value, saving, onChange, onClose, onSubmit, onCoverUpload }) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop knowledge-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="knowledge-editor knowledge-base-editor" onSubmit={onSubmit}>
        <header><div><div className="eyebrow">KNOWLEDGE AUTHORING</div><h2>New knowledge base</h2></div><button type="button" aria-label="Close editor" onClick={onClose}><X size={18} /></button></header>
        <div className="knowledge-editor-grid">
          <label><span>Title</span><input required value={value.title} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value, slug: current.slug || slugify(event.target.value) }))} /></label>
          <label><span>Slug</span><input required value={value.slug} onChange={(event) => onChange((current) => ({ ...current, slug: slugify(event.target.value) }))} /></label>
          <label className="full"><span>Description</span><textarea rows="4" value={value.description} onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="full knowledge-cover-upload"><span>Title image · optional</span><div><UploadSimple size={15} /><input type="file" accept="image/*" onChange={onCoverUpload} /><em>{value.coverUrl ? "Cover stored in S3" : "Upload cover image"}</em></div></label>
          <label><span>Visibility</span><select value={value.visibility} onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Public</option><option value="members">Members</option><option value="private">Private</option></select></label>
          <label><span>Order</span><input type="number" value={value.position} onChange={(event) => onChange((current) => ({ ...current, position: event.target.value }))} /></label>
        </div>
        <footer><span /><PrimarySpecularButton type="submit" disabled={saving}>{saving ? "Saving…" : "Create knowledge base"}</PrimarySpecularButton></footer>
      </form>
    </div>
  );
}

export function KnowledgeHub({ user, onRequireAuth }) {
  const [bases, setBases] = useState([]);
  const [baseAutoCovers, setBaseAutoCovers] = useState({});
  const [view, setView] = useState("catalog");
  const [baseSlug, setBaseSlug] = useState("");
  const [pages, setPages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [openNodes, setOpenNodes] = useState(new Set());
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogActiveIndex, setCatalogActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [baseEditorOpen, setBaseEditorOpen] = useState(false);
  const [editor, setEditor] = useState(initialEditor);
  const [baseEditor, setBaseEditor] = useState({ title: "", slug: "", description: "", coverUrl: "", visibility: "public", position: 10 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const catalogListRef = useRef(null);
  const catalogItemRefs = useRef([]);

  useEffect(() => {
    listKnowledgeBases().then((items) => {
      setBases(items);
      Promise.all(items.map(async (base) => {
        const knowledgePages = await listKnowledgePages(base.slug);
        const cover = knowledgePages.map((page) => resolveMarkdownCover(page.bodyMarkdown)).find(Boolean) ?? "";
        return [base.slug, cover];
      })).then((entries) => setBaseAutoCovers(Object.fromEntries(entries))).catch(() => setBaseAutoCovers({}));
    }).catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (view !== "reader" || !baseSlug) return;
    listKnowledgePages(baseSlug).then((items) => {
      setPages(items);
      setSelectedId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ""));
      setOpenNodes(new Set(items.filter((item) => items.some((child) => child.parentId === item.id)).map((item) => item.id)));
    }).catch((reason) => setError(reason.message));
  }, [baseSlug, view]);

  const selectedBase = bases.find((item) => item.slug === baseSlug);
  const selectedPage = pages.find((item) => item.id === selectedId);
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
  const canPublish = ["editor", "admin"].includes(user?.role);

  useEffect(() => {
    setCatalogActiveIndex(0);
  }, [filteredBaseKey]);

  useEffect(() => {
    const container = catalogListRef.current;
    const item = catalogItemRefs.current[catalogActiveIndex];
    if (!container || !item) return;
    const top = item.offsetTop - (container.clientHeight - item.offsetHeight) / 2;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [catalogActiveIndex, filteredBaseKey]);

  const openBase = (base) => {
    setBaseSlug(base.slug);
    setPages([]);
    setSelectedId("");
    setQuery("");
    setView("reader");
  };

  const returnToCatalog = () => {
    setView("catalog");
    setQuery("");
  };

  const selectPage = (page) => {
    if (page.locked) {
      onRequireAuth("Sign in to read this member-only knowledge page.");
      return;
    }
    setSelectedId(page.id);
  };

  const savePage = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createKnowledgePage(baseSlug, { ...editor, position: Number(editor.position) });
      setPages((current) => [...current, created]);
      setSelectedId(created.id);
      if (created.parentId) setOpenNodes((current) => new Set([...current, created.parentId]));
      setEditor(initialEditor);
      setEditorOpen(false);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBase = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createKnowledgeBase({ ...baseEditor, position: Number(baseEditor.position) });
      setBases((current) => [...current, created]);
      setBaseEditor({ title: "", slug: "", description: "", coverUrl: "", visibility: "public", position: 10 });
      setBaseEditorOpen(false);
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
    try {
      const media = await uploadMedia(file);
      const syntax = file.type.startsWith("image/") ? `\n![${file.name}](${media.url})\n` : file.type.startsWith("video/") ? `\n[${file.name}](${media.url})\n` : `\n[${file.name}](${media.url})\n`;
      setEditor((current) => ({ ...current, bodyMarkdown: `${current.bodyMarkdown}${syntax}` }));
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
        <div className="knowledge-catalog-toolbar">
          <div className="eyebrow">KNOWLEDGE / LIBRARIES</div>
          {canPublish ? <PrimarySpecularButton size="sm" onClick={() => setBaseEditorOpen(true)}><Plus size={14} />New knowledge base</PrimarySpecularButton> : null}
        </div>

        <label className="knowledge-catalog-search specular-search">
          <MagnifyingGlass size={16} />
          <input
            aria-label="Search knowledge bases"
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Search knowledge bases"
          />
          <span>{filteredBases.length} / {bases.length}</span>
        </label>

        <div className="knowledge-catalog-browser">
          <aside className="knowledge-catalog-index" aria-label="Knowledge base index">
            <header>
              <div><span>LIBRARY INDEX</span><strong>{String(filteredBases.length).padStart(2, "0")}</strong></div>
              <small>FOCUS FOLLOWS THE STACK</small>
            </header>
            <div className="knowledge-catalog-index-list" ref={catalogListRef} role="listbox" aria-label="Select a knowledge base">
              {filteredBases.map((base, index) => (
                <button
                  key={base.id}
                  ref={(node) => { catalogItemRefs.current[index] = node; }}
                  className={catalogActiveIndex === index ? "active" : ""}
                  type="button"
                  role="option"
                  aria-selected={catalogActiveIndex === index}
                  onClick={() => setCatalogActiveIndex(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{base.title}</strong><small>{base.visibility.toUpperCase()} COLLECTION</small></span>
                  <CaretRight size={13} aria-hidden="true" />
                </button>
              ))}
              {!filteredBases.length ? <p>No matching libraries.</p> : null}
            </div>
            <footer aria-hidden="true">
              <span>{filteredBases.length ? String(catalogActiveIndex + 1).padStart(2, "0") : "00"}</span>
              <span className="knowledge-catalog-index-progress"><span style={{ width: `${filteredBases.length ? ((catalogActiveIndex + 1) / filteredBases.length) * 100 : 0}%` }} /></span>
              <span>{String(filteredBases.length).padStart(2, "0")}</span>
            </footer>
          </aside>

          <section className="knowledge-swap-stage" aria-label="Knowledge base catalog">
            {filteredBases.length ? <CardSwap key={filteredBaseKey} width="min(72vw, 680px)" height="min(58vh, 490px)" cardDistance={42} verticalDistance={38} activeIndex={catalogActiveIndex} onActiveChange={setCatalogActiveIndex} onCardClick={(index) => openBase(filteredBases[index])}>
            {filteredBases.map((base, index) => {
              const coverUrl = base.coverUrl || baseAutoCovers[base.slug];
              return (
              <SwapCard className="knowledge-base-card" key={base.id} role="button" tabIndex="0" aria-label={`Open ${base.title}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openBase(base); }}>
                <div className={`knowledge-base-card-visual${coverUrl ? " has-cover" : ""}`} aria-hidden="true">
                  <span className="knowledge-base-card-index">{String(index + 1).padStart(2, "0")}</span>
                  {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <Books size={54} weight="thin" />}
                  <i /><i /><i />
                </div>
                <div className="knowledge-base-card-copy">
                  <div className="eyebrow">{base.visibility.toUpperCase()} COLLECTION</div>
                  <h2>{base.title}</h2>
                  <p>{base.description || "A growing collection of connected documents."}</p>
                  <span>Explore knowledge base <ArrowRight size={15} /></span>
                </div>
              </SwapCard>
            );})}
            </CardSwap> : <div className="knowledge-catalog-no-results">No knowledge bases match “{catalogQuery.trim()}”.</div>}
          </section>
        </div>

        {!bases.length && !error ? <div className="knowledge-catalog-empty">No knowledge bases have been published yet.</div> : null}
        <KnowledgeBaseEditorDialog open={baseEditorOpen} value={baseEditor} saving={saving} onChange={setBaseEditor} onClose={() => setBaseEditorOpen(false)} onSubmit={saveBase} onCoverUpload={attachBaseCover} />
        {error ? <div className="toast" role="status">{error}</div> : null}
      </main>
    );
  }

  return (
    <main className="knowledge-shell">
      <aside className="knowledge-sidebar">
        <div className="knowledge-sidebar-head">
          <button className="knowledge-back" type="button" onClick={returnToCatalog}><CaretLeft size={13} />All knowledge bases</button>
          <div className="eyebrow">KNOWLEDGE BASE</div>
          <div className="knowledge-base-current">
            <h2>{selectedBase?.title}</h2>
            {canPublish ? <button type="button" aria-label="Create knowledge base" title="Create knowledge base" onClick={() => setBaseEditorOpen(true)}><Plus size={14} /></button> : null}
          </div>
          <p>{selectedBase?.description}</p>
        </div>
        <label className="knowledge-search specular-search"><MagnifyingGlass size={15} /><input aria-label="Search this knowledge base" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this knowledge base" /></label>
        <nav className="knowledge-tree" aria-label="Knowledge pages">
          <PageTree childrenMap={childrenMap} selectedId={selectedId} openNodes={openNodes} onToggle={(id) => setOpenNodes((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })} onSelect={selectPage} />
          {!filteredPages.length ? <p className="knowledge-empty">No pages match this search.</p> : null}
        </nav>
        {canPublish ? <button className="knowledge-new-page" type="button" onClick={() => setEditorOpen(true)}><Plus size={14} />New page</button> : null}
      </aside>

      <article className="knowledge-document">
        {selectedPage ? (
          <>
            <div className="knowledge-breadcrumb"><span>{selectedBase?.title}</span><CaretRight size={12} /><span>{selectedPage.title}</span></div>
            <div className="knowledge-title"><div className="eyebrow">DOCUMENT / {String(selectedPage.position).padStart(2, "0")}</div><h1>{selectedPage.title}</h1><p>{selectedPage.summary}</p></div>
            <div className="knowledge-markdown"><MarkdownContent body={selectedPage.bodyMarkdown} className="knowledge-markdown-content" /></div>
          </>
        ) : <div className="knowledge-placeholder">Select a knowledge page.</div>}
      </article>

      <aside className="knowledge-toc">
        <div className="eyebrow">ON THIS PAGE</div>
        {toc.map((item) => <a className={item.depth === 3 ? "nested" : ""} key={`${item.id}-${item.title}`} href={`#${item.id}`}>{item.title}</a>)}
        {!toc.length ? <span>No subsections</span> : null}
      </aside>

      {editorOpen ? (
        <div className="dialog-backdrop knowledge-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditorOpen(false)}>
          <form className="knowledge-editor" onSubmit={savePage}>
            <header><div><div className="eyebrow">KNOWLEDGE AUTHORING</div><h2>New page</h2></div><button type="button" aria-label="Close editor" onClick={() => setEditorOpen(false)}><X size={18} /></button></header>
            <div className="knowledge-editor-grid">
              <label><span>Title</span><input required value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value, slug: current.slug || slugify(event.target.value) }))} /></label>
              <label><span>Slug</span><input required value={editor.slug} onChange={(event) => setEditor((current) => ({ ...current, slug: slugify(event.target.value) }))} /></label>
              <label><span>Parent page</span><select value={editor.parentId} onChange={(event) => setEditor((current) => ({ ...current, parentId: event.target.value }))}><option value="">Top level</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label>
              <label><span>Order</span><input type="number" value={editor.position} onChange={(event) => setEditor((current) => ({ ...current, position: event.target.value }))} /></label>
              <label className="full"><span>Summary</span><input value={editor.summary} onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))} /></label>
              <label><span>Visibility</span><select value={editor.visibility} onChange={(event) => setEditor((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Public</option><option value="members">Members</option><option value="private">Private</option></select></label>
              <label><span>Status</span><select value={editor.status} onChange={(event) => setEditor((current) => ({ ...current, status: event.target.value }))}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
              <label className="full"><span>Markdown / LaTeX / sandboxed HTML</span><textarea rows="16" value={editor.bodyMarkdown} onChange={(event) => setEditor((current) => ({ ...current, bodyMarkdown: event.target.value }))} /></label>
            </div>
            <footer>
              <label className="knowledge-upload"><UploadSimple size={15} />Attach image or video<input type="file" accept="image/*,video/*" onChange={attachMedia} /></label>
              <PrimarySpecularButton type="submit" disabled={saving}>{saving ? "Saving…" : "Publish page"}</PrimarySpecularButton>
            </footer>
          </form>
        </div>
      ) : null}
      <KnowledgeBaseEditorDialog open={baseEditorOpen} value={baseEditor} saving={saving} onChange={setBaseEditor} onClose={() => setBaseEditorOpen(false)} onSubmit={saveBase} onCoverUpload={attachBaseCover} />
      {error ? <div className="toast" role="status">{error}</div> : null}
    </main>
  );
}
