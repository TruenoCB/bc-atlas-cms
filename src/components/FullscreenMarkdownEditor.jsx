import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowsInSimple,
  CodeBlock,
  ImageSquare,
  LinkSimple,
  Paperclip,
  TextHTwo,
  TextHThree,
  VideoCamera,
} from "@phosphor-icons/react";
import { uploadMedia } from "../lib/api.js";
import { MarkdownContent } from "./MarkdownContent.jsx";

function mediaSyntax(file, media) {
  const label = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() || "Media";
  if (file.type.startsWith("image/")) return `![${label}](${media.url})`;
  return `[${label}](${media.url})`;
}

export function FullscreenMarkdownEditor({ open, value, onChange, onClose, title = "Untitled content" }) {
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const rememberSelection = (event) => {
    selectionRef.current = {
      start: event.currentTarget.selectionStart ?? 0,
      end: event.currentTarget.selectionEnd ?? event.currentTarget.selectionStart ?? 0,
    };
  };

  const insert = (snippet, selectStart = snippet.length, selectEnd = selectStart) => {
    const start = Math.min(selectionRef.current.start, value.length);
    const end = Math.min(Math.max(selectionRef.current.end, start), value.length);
    onChange(`${value.slice(0, start)}${snippet}${value.slice(end)}`);
    selectionRef.current = { start: start + selectStart, end: start + selectEnd };
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
    });
  };

  const wrapSelection = (prefix, suffix, fallback) => {
    const start = Math.min(selectionRef.current.start, value.length);
    const end = Math.min(Math.max(selectionRef.current.end, start), value.length);
    const selected = value.slice(start, end) || fallback;
    const snippet = `${prefix}${selected}${suffix}`;
    insert(snippet, prefix.length, prefix.length + selected.length);
  };

  const uploadFiles = async (files) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    setUploading(true);
    setError("");
    try {
      const snippets = [];
      for (const file of selected) {
        const media = await uploadMedia(file);
        snippets.push(mediaSyntax(file, media));
      }
      insert(`${snippets.join("\n\n")}\n\n`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The media upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const pasteImages = (event) => {
    const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    rememberSelection(event);
    void uploadFiles(images);
  };

  const chooseFiles = (input) => {
    selectionRef.current = {
      start: textareaRef.current?.selectionStart ?? value.length,
      end: textareaRef.current?.selectionEnd ?? value.length,
    };
    input.current?.click();
  };

  return createPortal(
    <div className="fullscreen-markdown" role="dialog" aria-modal="true" aria-label={`Fullscreen editor for ${title}`}>
      <header className="fullscreen-markdown-header">
        <div><span>CONTENT / MARKDOWN WORKSPACE</span><strong>{title}</strong></div>
        <div><small>{uploading ? "Uploading to private S3…" : "Changes stay in the current draft"}</small><button type="button" onClick={onClose}><ArrowsInSimple size={16} />Back to details</button></div>
      </header>

      <aside className="fullscreen-markdown-tools" aria-label="Markdown insertion tools">
        <span>INSERT</span>
        <button type="button" title="Insert level 2 heading" onClick={() => insert("\n## Section heading\n\n", 4, 19)}><TextHTwo size={19} /><em>H2</em></button>
        <button type="button" title="Insert level 3 heading" onClick={() => insert("\n### Subsection heading\n\n", 5, 23)}><TextHThree size={19} /><em>H3</em></button>
        <button type="button" title="Insert link" onClick={() => wrapSelection("[", "](https://)", "link text")}><LinkSimple size={19} /><em>Link</em></button>
        <button type="button" title="Insert code block" onClick={() => wrapSelection("\n```\n", "\n```\n", "code")}><CodeBlock size={19} /><em>Code</em></button>
        <span>MEDIA</span>
        <button type="button" disabled={uploading} title="Upload and insert images" onClick={() => chooseFiles(imageInputRef)}><ImageSquare size={19} /><em>Image</em></button>
        <button type="button" disabled={uploading} title="Upload and insert videos" onClick={() => chooseFiles(videoInputRef)}><VideoCamera size={19} /><em>Video</em></button>
        <button type="button" disabled={uploading} title="Upload and insert a file" onClick={() => chooseFiles(fileInputRef)}><Paperclip size={19} /><em>File</em></button>
        <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />
        <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />
        <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />
      </aside>

      <section className="fullscreen-markdown-pane fullscreen-markdown-source">
        <header><span>MARKDOWN SOURCE</span><small>Paste images directly · Markdown, GFM, LaTeX, embeds and html-sandbox</small></header>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={rememberSelection}
          onClick={rememberSelection}
          onKeyUp={rememberSelection}
          onPaste={pasteImages}
          spellCheck="true"
          placeholder="Write in Markdown…"
        />
      </section>

      <section className="fullscreen-markdown-pane fullscreen-markdown-preview">
        <header><span>LIVE PREVIEW</span><small>Rendered with the public reader pipeline</small></header>
        <div><MarkdownContent body={value} className="markdown-body fullscreen-preview-content" /></div>
      </section>
      {error ? <p className="fullscreen-markdown-error" role="alert">{error}</p> : null}
    </div>,
    document.body,
  );
}
