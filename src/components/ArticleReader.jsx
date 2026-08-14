import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Hash, X } from "@phosphor-icons/react";
import { createComment, listComments } from "../lib/api.js";
import { meaningfulContentTags, resolveContentCover } from "../lib/contentMedia.js";
import { ParticleText } from "./ParticleText.jsx";
import { PixelWorldMap } from "./PixelWorldMap.jsx";
import { PrimarySpecularButton } from "./SpecularButton.jsx";
import { MarkdownContent } from "./MarkdownContent.jsx";

function headingSlug(value) {
  return String(value).toLowerCase().trim().replace(/[`*_]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "section";
}

function extractToc(markdown = "") {
  return markdown.split("\n").flatMap((line) => {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (!match) return [];
    const title = match[2].replace(/[`*_]/g, "");
    return [{ depth: match[1].length, title, id: headingSlug(title) }];
  });
}

function formatDate(value) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function readTime(markdown = "") {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export function ArticleReader({ article, onClose, user, footprints = [] }) {
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [website, setWebsite] = useState("");
  const [commentError, setCommentError] = useState("");
  const [publishingComment, setPublishingComment] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [closing, setClosing] = useState(false);
  const readerRef = useRef(null);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (!article?.slug) return;
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    listComments(article.slug).then(setComments).catch(() => setComments([]));
    setCommentBody("");
    setCommentError("");
    setScrollProgress(0);
    setClosing(false);
  }, [article?.slug]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const footprint = article?.tags?.find((tag) => tag.slug === "footprint");
  const isEssay = article?.type === "article" && !footprint;
  const location = footprint?.properties?.location_name;
  const toc = useMemo(() => extractToc(article?.bodyMarkdown), [article?.bodyMarkdown]);
  const visibleTags = meaningfulContentTags(article);
  const cover = resolveContentCover(article);

  useEffect(() => {
    if (!isEssay || !article) return undefined;
    const reader = readerRef.current;
    if (!reader) return undefined;
    const updateProgress = () => {
      const range = reader.scrollHeight - reader.clientHeight;
      setScrollProgress(range > 0 ? Math.min(1, reader.scrollTop / range) : 0);
    };
    reader.addEventListener("scroll", updateProgress, { passive: true });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("revealed", entry.isIntersecting));
    }, { root: reader, threshold: 0.14 });
    reader.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
    updateProgress();
    return () => {
      reader.removeEventListener("scroll", updateProgress);
      observer.disconnect();
    };
  }, [article, isEssay]);

  if (!article) return null;

  const requestClose = () => {
    if (isEssay) {
      onClose();
      return;
    }
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    closeTimerRef.current = window.setTimeout(onClose, reducedMotion ? 0 : 420);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    setCommentError("");
    if (!user && guestName.trim().length < 2) {
      setCommentError("Add a guest name with at least 2 characters.");
      return;
    }
    setPublishingComment(true);
    try {
      const created = await createComment(article.slug, commentBody, user ? "" : guestName.trim(), website);
      setComments((current) => [...current, created]);
      setCommentBody("");
      setWebsite("");
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "The comment could not be published.");
    } finally {
      setPublishingComment(false);
    }
  };

  const commentsBlock = (
    <section className={`comments-section${isEssay ? " essay-comments" : ""}`} aria-labelledby="comments-title" data-reveal={isEssay ? "" : undefined}>
      <div className="comments-heading"><span className="reader-kicker">DISCUSSION / OPEN</span><h2 id="comments-title">{comments.length} comment{comments.length === 1 ? "" : "s"}</h2><p>Signed-in readers and guests can join the discussion.</p></div>
      <div className="comment-list">
        {comments.map((comment) => (
          <article key={comment.id}><header><strong>{comment.authorDisplayName}</strong><time>{formatDate(comment.createdAt)}</time></header><p>{comment.body}</p></article>
        ))}
        {!comments.length ? <p className="comment-empty">No comments yet. Add the first useful response.</p> : null}
      </div>
      <form onSubmit={submitComment}>
        {!user ? <label className="guest-name-field"><span>Guest name</span><input required minLength="2" maxLength="80" value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="How should we credit you?" /></label> : <div className="commenting-as">Commenting as <strong>{user.displayName}</strong></div>}
        <label className="comment-honeypot" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        <textarea required maxLength="2000" rows="4" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Add a considered response" />
        {commentError ? <p className="form-error">{commentError}</p> : null}
        <PrimarySpecularButton
          className="comment-specular-action"
          type="submit"
          disabled={publishingComment}
        >{publishingComment ? "Publishing…" : "Publish comment"}</PrimarySpecularButton>
      </form>
    </section>
  );

  if (!isEssay) {
    return (
      <div className={`dialog-backdrop reader-backdrop compact-reader-backdrop${closing ? " closing" : ""}`} role="presentation" onMouseDown={requestClose}>
        <article ref={readerRef} className={`reader-panel compact-reader-panel${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="reader-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="icon-button reader-close" type="button" aria-label="Close article" onClick={requestClose}><X size={18} /></button>
          {cover ? <figure className="compact-reader-cover"><img src={cover.url} alt={cover.alt} /></figure> : null}
          <div className="reader-kicker">{location ? `FIELD NOTE / ${location.toUpperCase()}` : article.type?.toUpperCase()}</div>
          <h1 id="reader-title">{article.title}</h1>
          <p className="reader-summary">{article.summary}</p>
          <div className="reader-meta"><span>{article.visibility ?? "public"}</span><span>{visibleTags.map((tag) => `#${tag.slug}`).join("  ")}</span></div>
          <MarkdownContent body={article.bodyMarkdown} />
          {commentsBlock}
        </article>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop reader-backdrop essay-reader-backdrop" role="presentation">
      <article ref={readerRef} className="reader-panel essay-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title" tabIndex="0">
        <div className="essay-reader-ambient-map" aria-hidden="true">
          <PixelWorldMap footprints={footprints} expanded ambient clickable={false} showLabels={false} />
        </div>
        <div className="essay-progress" aria-hidden="true"><span style={{ transform: `scaleX(${scrollProgress})` }} /></div>
        <button className="essay-reader-close" type="button" onClick={onClose}><ArrowLeft size={16} />Back to essays</button>

        <div className="essay-foreground">
        <header className="essay-hero" data-reveal>
          <div className="essay-brand-banner" aria-hidden="true">
            {cover ? <img className="essay-cover-image" src={cover.url} alt="" /> : <ParticleText
              text="B.C"
              className="essay-banner-particles"
              particleSize={2.1}
              density={4}
              color="#d9d4df"
              highlightColor="#a56cff"
              scatter={0}
              gatherDuration={1}
              stagger={0}
              pointerRepel={28}
              repelRadius={120}
              idleDrift={0.18}
              trigger="hover"
              fontSize="clamp(9rem, 25vw, 21rem)"
              fontWeight={600}
              fontFamily="Cormorant Garamond, Georgia, serif"
              glow
            />}
            <small>ESSAYS / SYSTEMS / FIELDWORK</small>
          </div>
          <h1 id="reader-title">{article.title}</h1>
          <div className="essay-byline">
            <span>By <strong>B.C</strong></span><time>{formatDate(article.publishedAt)}</time><span><Clock size={14} />{readTime(article.bodyMarkdown)} min read</span>
          </div>
          <div className="essay-divider" />
          <p>{article.summary}</p>
          <div className="essay-tag-row">{visibleTags.map((tag) => <span key={tag.slug}><Hash size={12} />{tag.name || tag.slug}</span>)}</div>
        </header>

        <div className="essay-reading-layout">
          <aside className="essay-toc" aria-label="Article table of contents">
            <span>IN THIS ESSAY</span>
            {toc.map((item) => <a key={`${item.id}-${item.title}`} className={item.depth === 3 ? "nested" : ""} href={`#${item.id}`}>{item.title}</a>)}
          </aside>
          <main className="essay-content-column">
            <MarkdownContent body={article.bodyMarkdown} className="markdown-body essay-markdown" />

            <section className="essay-field-log" data-reveal>
              <header><span className="reader-kicker">ARTICLE LOG</span><h2>Signals left behind.</h2></header>
              <div className="essay-log-grid">
                <article><small>01 / PUBLISHED</small><strong>{formatDate(article.publishedAt)}</strong><span>UTC archive record</span></article>
                <article><small>02 / SIGNALS</small><strong>{String(visibleTags.length).padStart(2, "0")} tags</strong><span>{visibleTags.map((tag) => tag.slug).join(" · ") || "uncategorized"}</span></article>
                <article><small>03 / ACCESS</small><strong>{article.visibility}</strong><span>Reader visibility</span></article>
              </div>
            </section>

            {commentsBlock}
          </main>
        </div>
        </div>

        <div className="essay-footprint-reveal">
        <section className="essay-footprint-section">
          <div className="essay-footprint-copy">
            <ParticleText
              text="B.C"
              className="essay-footprint-particles"
              particleSize={2.3}
              density={5}
              color="#352943"
              highlightColor="#8d5bc8"
              scatter={0}
              gatherDuration={1}
              stagger={0}
              pointerRepel={18}
              repelRadius={120}
              idleDrift={0.12}
              trigger="hover"
              fontSize="clamp(12rem, 29vw, 31rem)"
              fontWeight={600}
              fontFamily="Cormorant Garamond, Georgia, serif"
              glow={false}
            />
            <div className="essay-footprint-copy-inner">
              <span className="reader-kicker">B.C / FOOTPRINT ARCHIVE</span>
              <h2>Ideas move<br />through places.</h2>
              <p>The archive follows the coordinates behind each field note. Move across the map to disturb its signal.</p>
            </div>
          </div>
          <div className="essay-footprint-visual">
            <div className="essay-footprint-stats" aria-label={`${footprints.length} mapped field notes`}>
              <span>{String(footprints.length).padStart(2, "0")}</span>
              <small>MAPPED NOTES<br />GLOBAL ARCHIVE</small>
            </div>
            <div className="essay-footprint-map">
              <PixelWorldMap footprints={footprints} selectedId={article.id} expanded ambient clickable={false} showLabels={false} animateFormation={false} />
            </div>
          </div>
        </section>
        </div>
      </article>
    </div>
  );
}
