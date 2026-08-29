import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CaretDown, ListBullets, MagnifyingGlass, SidebarSimple, X } from "@phosphor-icons/react";
import "./MobileReaderTools.css";

function safeFind(root, id) {
  if (!id) return null;
  try {
    return root?.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id);
  } catch {
    return null;
  }
}

export function MobileReaderTools({
  title,
  toc = [],
  readerRef,
  onBack,
  documents = [],
  selectedDocumentId = "",
  onDocumentSelect,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search this page",
  brandBack = false,
}) {
  const [openPanel, setOpenPanel] = useState("");
  const [activeId, setActiveId] = useState(toc[0]?.id ?? "");
  const [localSearch, setLocalSearch] = useState("");
  const searchInputRef = useRef(null);
  const query = searchValue ?? localSearch;
  const setQuery = onSearchChange ?? setLocalSearch;

  const visibleToc = useMemo(() => {
    if (documents.length) return toc;
    const needle = query.trim().toLowerCase();
    return needle ? toc.filter((item) => item.title.toLowerCase().includes(needle)) : toc;
  }, [documents.length, query, toc]);

  const visibleDocuments = useMemo(() => {
    if (searchValue !== undefined) return documents;
    const needle = query.trim().toLowerCase();
    return needle ? documents.filter((item) => item.title.toLowerCase().includes(needle)) : documents;
  }, [documents, query, searchValue]);

  useEffect(() => {
    if (openPanel === "search") window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [openPanel]);

  useEffect(() => {
    if (!toc.length) return undefined;
    const root = readerRef?.current;
    const nodes = toc.map((item) => safeFind(root, item.id)).filter(Boolean);
    if (!nodes.length) return undefined;
    const scrollRoot = root && root.scrollHeight > root.clientHeight + 4 ? root : null;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
    }, { root: scrollRoot, rootMargin: "-18% 0px -68% 0px", threshold: [0, 1] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [readerRef, toc]);

  const activeTitle = toc.find((item) => item.id === activeId)?.title ?? toc[0]?.title ?? "On this page";
  const toggle = (panel) => setOpenPanel((current) => current === panel ? "" : panel);
  const jumpToHeading = (id) => {
    safeFind(readerRef?.current, id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    setOpenPanel("");
  };

  return (
    <section className={`mobile-reader-tools${brandBack ? " mobile-reader-tools--knowledge" : ""}${openPanel ? " panel-open" : ""}`} aria-label="Reader navigation">
      <header className="mobile-reader-toolbar">
        <button className={brandBack ? "mobile-reader-home-mark" : ""} type="button" aria-label={brandBack ? "B.C home" : "Back"} onClick={onBack}>
          {brandBack ? <span className="brand-dot-matrix" aria-hidden="true">B.C</span> : <ArrowLeft size={18} />}
        </button>
        <strong title={title}>{title}</strong>
        <div>
          <button type="button" aria-label="Search document" aria-expanded={openPanel === "search"} onClick={() => toggle("search")}><MagnifyingGlass size={19} /></button>
          {documents.length ? <button type="button" aria-label="Open document directory" aria-expanded={openPanel === "documents"} onClick={() => toggle("documents")}><SidebarSimple size={20} /></button> : null}
        </div>
      </header>

      <div className={`mobile-reader-search${openPanel === "search" ? " open" : ""}`} aria-hidden={openPanel !== "search"}>
        <label><MagnifyingGlass size={19} /><input ref={searchInputRef} aria-label={searchPlaceholder} tabIndex={openPanel === "search" ? 0 : -1} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} /><button type="button" tabIndex={openPanel === "search" ? 0 : -1} aria-label="Close search" onClick={() => setOpenPanel("")}><X size={16} /></button></label>
      </div>

      {documents.length ? <>
        <button className={`mobile-reader-drawer-scrim${openPanel === "documents" ? " open" : ""}`} type="button" aria-label="Close document directory" tabIndex={openPanel === "documents" ? 0 : -1} onClick={() => setOpenPanel("")} />
        <aside className={`mobile-reader-side-drawer${openPanel === "documents" ? " open" : ""}`} aria-hidden={openPanel !== "documents"}>
          <header>
            <div><span>KNOWLEDGE BASE</span><strong>Document directory</strong></div>
            <button type="button" aria-label="Close document directory" tabIndex={openPanel === "documents" ? 0 : -1} onClick={() => setOpenPanel("")}><X size={18} /></button>
          </header>
          <nav aria-label="Document directory">
            {visibleDocuments.map((item) => <button className={item.id === selectedDocumentId ? "active" : ""} style={{ "--mobile-document-depth": item.depth ?? 0 }} key={item.id} type="button" tabIndex={openPanel === "documents" ? 0 : -1} onClick={() => { onDocumentSelect?.(item); setOpenPanel(""); }}><span>{item.title}</span>{item.locked ? <small>LOCKED</small> : null}</button>)}
            {!visibleDocuments.length ? <p>No documents match this search.</p> : null}
          </nav>
        </aside>
      </> : null}

      {toc.length ? <>
        <button className="mobile-reader-disclosure mobile-reader-toc-trigger" type="button" aria-expanded={openPanel === "toc"} onClick={() => toggle("toc")}>
          <span><ListBullets size={16} />{activeTitle}</span><CaretDown size={15} />
        </button>
        <div className={`mobile-reader-panel toc-panel${openPanel === "toc" ? " open" : ""}`} aria-hidden={openPanel !== "toc"}>
          <nav aria-label="On this page">
            {visibleToc.map((item) => <button className={`${item.id === activeId ? "active " : ""}depth-${item.depth}`} key={item.id} type="button" tabIndex={openPanel === "toc" ? 0 : -1} onClick={() => jumpToHeading(item.id)}>{item.title}</button>)}
            {!visibleToc.length ? <p>No headings match this search.</p> : null}
          </nav>
        </div>
      </> : null}
    </section>
  );
}
