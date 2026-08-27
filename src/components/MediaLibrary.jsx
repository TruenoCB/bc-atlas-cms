import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileText, ImageSquare, MagnifyingGlass, Trash, UploadSimple } from "@phosphor-icons/react";
import { deleteMedia, listMediaPage, uploadMedia } from "../lib/api.js";
import { PrimarySpecularButton } from "./SpecularButton.jsx";
import { Pagination } from "./Pagination.jsx";

const mediaKinds = [
  ["all", "All files"],
  ["image", "Images"],
  ["video", "Videos"],
  ["audio", "Audio"],
  ["document", "Files"],
];

function mediaKind(item) {
  if (item.contentType.startsWith("image/")) return "image";
  if (item.contentType.startsWith("video/")) return "video";
  if (item.contentType.startsWith("audio/")) return "audio";
  return "document";
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${(bytes / (1024 ** exponent)).toFixed(bytes / (1024 ** exponent) >= 10 ? 0 : 1)} ${units[exponent - 1]}`;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function markdownFor(item) {
  const label = item.originalName.replace(/\.[^/.]+$/, "") || "Media";
  return mediaKind(item) === "image" ? `![${label}](${item.url})` : `[${label}](${item.url})`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const control = document.createElement("textarea");
  control.value = value;
  control.style.position = "fixed";
  control.style.opacity = "0";
  document.body.appendChild(control);
  control.select();
  document.execCommand("copy");
  control.remove();
}

function MediaPreview({ item }) {
  const kind = mediaKind(item);
  if (kind === "image") return <img src={item.url} alt={item.originalName} loading="lazy" />;
  if (kind === "video") return <video src={item.url} controls playsInline preload="metadata" />;
  if (kind === "audio") return <div className="media-library-audio"><span>AUDIO</span><audio src={item.url} controls preload="metadata" /></div>;
  return <div className="media-library-file"><FileText size={40} weight="thin" /><span>{item.contentType || "FILE"}</span></div>;
}

export function MediaLibrary({ onBack }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const uploadInputRef = useRef(null);
  const libraryRef = useRef(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listMediaPage({ q: query.trim(), kind: kind === "all" ? "" : kind, page });
      setItems(result.items);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Media could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [kind, page, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMedia(); }, query.trim() ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [loadMedia, query]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(""), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const upload = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of files) await uploadMedia(file);
      if (page === 1) await loadMedia();
      else setPage(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "One or more files could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const copy = async (item, mode) => {
    try {
      await copyText(mode === "markdown" ? markdownFor(item) : item.url);
      setCopied(`${item.id}-${mode}`);
    } catch {
      setError("The browser blocked clipboard access. Copy the value from the displayed link instead.");
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete “${item.originalName}” permanently? Existing Markdown and media links that use this file will stop working.`)) return;
    setDeleting(item.id);
    setError("");
    try {
      await deleteMedia(item.id);
      if (items.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadMedia();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file could not be deleted.");
    } finally {
      setDeleting("");
    }
  };

  const changePage = (nextPage) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => libraryRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  return (
    <main className="media-library content-hub" ref={libraryRef}>
      <header className="media-library-heading">
        <div>
          <button className="media-library-back" type="button" onClick={onBack}><ArrowLeft size={15} />Back to workspace</button>
          <div className="eyebrow">WORKSPACE / MEDIA LIBRARY</div>
          <h1>Media, kept<br />within reach.</h1>
          <p>Browse files indexed in MySQL and stored privately in S3. Copy a same-origin link or ready-to-paste Markdown without exposing MinIO credentials.</p>
        </div>
        <PrimarySpecularButton type="button" size="sm" onClick={() => uploadInputRef.current?.click()} disabled={uploading}><UploadSimple size={16} />{uploading ? "Uploading…" : "Upload files"}</PrimarySpecularButton>
        <input ref={uploadInputRef} type="file" multiple hidden onChange={upload} />
      </header>

      <section className="media-library-tools" aria-label="Media library tools">
        <label className="specular-search"><MagnifyingGlass size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} aria-label="Search media files" placeholder="Search filename, object key, or MIME type" /></label>
        <div className="media-library-filters" role="group" aria-label="Filter media type">
          {mediaKinds.map(([value, label]) => <button key={value} type="button" className={kind === value ? "active" : ""} onClick={() => { setKind(value); setPage(1); }} aria-pressed={kind === value}>{label}</button>)}
        </div>
        <small>{loading ? "Loading library…" : `${total} indexed file${total === 1 ? "" : "s"}`}</small>
      </section>

      {error ? <p className="form-error media-library-error" role="alert">{error}</p> : null}
      <section className="media-library-grid" aria-live="polite">
        {items.map((item) => {
          const kindLabel = mediaKind(item).toUpperCase();
          const markdown = markdownFor(item);
          return (
            <article className="media-library-card" key={item.id}>
              <div className={`media-library-preview ${mediaKind(item)}`}><MediaPreview item={item} /></div>
              <div className="media-library-copy">
                <header><span>{kindLabel}</span><time>{formatDate(item.createdAt)}</time></header>
                <h2 title={item.originalName}>{item.originalName}</h2>
                <p>{item.contentType} · {formatBytes(item.sizeBytes)}</p>
                <code title={item.url}>{item.url}</code>
                <div className="media-library-actions">
                  <button type="button" onClick={() => copy(item, "markdown")}>{copied === `${item.id}-markdown` ? <><Check size={13} />Copied</> : "Copy Markdown"}</button>
                  <button type="button" onClick={() => copy(item, "url")}>{copied === `${item.id}-url` ? <><Check size={13} />Copied</> : "Copy link"}</button>
                  <a href={item.url} target="_blank" rel="noreferrer">Open</a>
                  <button className="media-delete-action" type="button" disabled={deleting === item.id} onClick={() => remove(item)}><Trash size={13} />{deleting === item.id ? "Deleting…" : "Delete"}</button>
                </div>
                <span className="media-library-markdown" aria-label="Markdown syntax">{markdown}</span>
              </div>
            </article>
          );
        })}
      </section>
      {!loading && !items.length ? <div className="media-library-empty"><ImageSquare size={28} weight="thin" /><p>{query ? "No indexed files match this search." : "No media has been uploaded yet."}</p></div> : null}
      {!loading && total ? <Pagination page={page} totalPages={totalPages} onPageChange={changePage} /> : null}
    </main>
  );
}
