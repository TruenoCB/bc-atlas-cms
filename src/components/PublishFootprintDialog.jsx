import { useEffect, useMemo, useState } from "react";
import { Check, Code, Eye, MapPin, UploadSimple, X } from "@phosphor-icons/react";
import { uploadMedia } from "../lib/api.js";
import { PrimarySpecularButton } from "./SpecularButton.jsx";
import { MarkdownContent } from "./MarkdownContent.jsx";

const initialForm = {
  kind: "article",
  title: "",
  slug: "",
  summary: "",
  locationName: "",
  latitude: "",
  longitude: "",
  visibility: "public",
  status: "published",
  tags: "travel, field-notes",
  bodyMarkdown: "# A new field note\n\nWrite the story behind this place. Markdown, GFM, and LaTeX are supported.\n\n$$E = mc^2$$",
  mediaUrl: "",
  mediaType: "",
  coverUrl: "",
  coverAlt: "",
};

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function PublishFootprintDialog({ open, composerMode = "create", initialValue = null, onClose, onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState("write");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...initialForm, ...(initialValue ?? {}) });
    setMode("write");
    setStatus("idle");
    setError("");
    setUploading(false);
  }, [open, initialValue]);

  const coordinatesValid = useMemo(() => {
    if (form.kind !== "footprint") return true;
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  }, [form.kind, form.latitude, form.longitude]);

  if (!open) return null;

  const editing = composerMode === "edit";
  const duplicating = composerMode === "duplicate";

  const update = (key, value) => setForm((current) => ({
    ...current,
    [key]: value,
    ...(key === "title" && !current.slug ? { slug: slugify(value) } : {}),
  }));

  const upload = async (event, purpose = "media") => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const media = await uploadMedia(file);
      setForm((current) => purpose === "cover"
        ? { ...current, coverUrl: media.url, coverAlt: current.coverAlt || current.title }
        : { ...current, mediaUrl: media.url, mediaType: media.contentType ?? file.type });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The media upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!coordinatesValid) {
      setError("Enter a valid latitude and longitude.");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      await onSubmit({
        ...form,
        slug: form.slug || slugify(form.title),
        tags: form.tags.split(",").map((tag) => slugify(tag)).filter(Boolean),
      });
      setStatus("saved");
      window.setTimeout(() => {
        setForm(initialForm);
        setStatus("idle");
        onClose();
      }, 650);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The field note could not be published.");
      setStatus("idle");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="publish-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div>
            <div className="eyebrow">CONTENT / COMPOSER</div>
            <h2 id="publish-title">{editing ? "Edit content." : duplicating ? "Duplicate as a new draft." : "Publish without changing tools."}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close publisher" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="publish-form">
          <label>
            <span>Content type</span>
            <select value={form.kind} onChange={(event) => update("kind", event.target.value)}>
              <option value="article">Essay</option>
              <option value="thought">Thought</option>
              <option value="gallery">Gallery</option>
              <option value="video">Video</option>
              <option value="footprint">Field note / footprint</option>
            </select>
          </label>
          <div className="form-grid two-columns">
            <label>
              <span>Title</span>
              <input required value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="The shape of a distant city" />
            </label>
            <label>
              <span>Slug</span>
              <input value={form.slug} onChange={(event) => update("slug", slugify(event.target.value))} placeholder="field-note-city" />
            </label>
          </div>
          <label>
            <span>Summary</span>
            <textarea required rows="2" value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="A concise reason to open this field note." />
          </label>
          <div className="form-grid two-columns cover-fields">
            <label className="media-upload-field">
              <span>Title image · optional</span>
              <div><UploadSimple size={17} /><input type="file" accept="image/*" onChange={(event) => upload(event, "cover")} /><em>{uploading ? "Uploading to S3…" : form.coverUrl ? "Cover stored in S3" : "Choose cover image"}</em></div>
            </label>
            <label>
              <span>Cover alt text</span>
              <input value={form.coverAlt} onChange={(event) => update("coverAlt", event.target.value)} placeholder={form.title || "Describe the image"} />
            </label>
          </div>
          <div className="schema-note"><Code size={15} /><span><strong>cover</strong> tag → manual title image; otherwise the first article image is used automatically.</span></div>
          {form.kind === "footprint" ? (
            <>
              <div className="form-grid location-grid">
                <label className="location-name">
                  <span>Location</span>
                  <div className="input-with-icon"><MapPin size={15} /><input required value={form.locationName} onChange={(event) => update("locationName", event.target.value)} placeholder="Lisbon" /></div>
                </label>
                <label><span>Latitude</span><input required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={(event) => update("latitude", event.target.value)} placeholder="38.7223" /></label>
                <label><span>Longitude</span><input required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={(event) => update("longitude", event.target.value)} placeholder="-9.1393" /></label>
              </div>
              <div className="schema-note"><Code size={15} /><span><strong>footprint</strong> tag → <code>latitude:number</code> · <code>longitude:number</code> · <code>location_name:string</code></span></div>
            </>
          ) : null}
          {form.kind === "gallery" || form.kind === "video" ? (
            <label className="media-upload-field">
              <span>Media asset · images, video, audio, archives, and documents</span>
              <div><UploadSimple size={17} /><input type="file" onChange={upload} /><em>{uploading ? "Uploading to S3…" : form.mediaUrl ? "Stored in S3" : "Choose a local file"}</em></div>
            </label>
          ) : null}
          <div className="form-grid three-columns publishing-controls">
            <label>
              <span>Additional tags</span>
              <input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="travel, systems" />
            </label>
            <label>
              <span>Visibility</span>
              <select value={form.visibility} onChange={(event) => update("visibility", event.target.value)}>
                <option value="public">Public</option>
                <option value="members">Signed-in readers</option>
                <option value="private">Author and admin only</option>
              </select>
            </label>
            <label>
              <span>Publishing status</span>
              <select value={form.status} onChange={(event) => update("status", event.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <div className="editor-toolbar" role="tablist" aria-label="Markdown editor mode">
            <button type="button" className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}><Code size={14} />Write</button>
            <button type="button" className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><Eye size={14} />Preview</button>
          </div>
          <div className="schema-note"><Code size={15} /><span>Safe video embed: <code>[embed](https://youtube.com/...)</code> · sandboxed HTML: <code>```html-sandbox</code></span></div>
          {mode === "write" ? (
            <textarea className="markdown-editor" rows="10" value={form.bodyMarkdown} onChange={(event) => update("bodyMarkdown", event.target.value)} />
          ) : (
            <div className="markdown-preview markdown-body">
              <MarkdownContent body={form.bodyMarkdown} className="markdown-preview-content" />
            </div>
          )}

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer className="dialog-footer">
            <p>Every module uses the same content record. Typed tags add footprints, media, and future plugin properties without creating isolated tables.</p>
            <PrimarySpecularButton type="submit" disabled={status === "saving" || status === "saved"}>
              {status === "saved" ? <><Check size={16} />Saved</> : status === "saving" ? "Saving…" : editing ? "Save changes" : form.status === "draft" ? "Save draft" : "Publish content"}
            </PrimarySpecularButton>
          </footer>
        </form>
      </section>
    </div>
  );
}
