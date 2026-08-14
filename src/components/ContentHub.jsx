import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  FileText,
  ImageSquare,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Plus,
  Quotes,
  RssSimple,
} from "@phosphor-icons/react";
import SpecularButton, { PrimarySpecularButton } from "./SpecularButton.jsx";
import { AnimatedList } from "./AnimatedList.jsx";
import { meaningfulContentTags, resolveContentCover } from "../lib/contentMedia.js";

const specularControlProps = {
  size: "sm",
  radius: 3,
  tint: "#a56cff",
  tintOpacity: 0.018,
  blur: 5,
  textColor: "#aaa5af",
  lineColor: "#c18aff",
  baseColor: "#37323e",
  intensity: 0.9,
  shineSize: 11,
  shineFade: 46,
  thickness: 0.8,
  speed: 0.24,
  proximity: 190,
};

function belongsToSection(item, section) {
  const footprint = item.tags?.some((tag) => tag.slug === "footprint");
  if (section === "Essays") return item.type === "article" && !footprint;
  if (section === "Thoughts") return item.type === "thought";
  if (section === "Gallery") return item.type === "gallery" || item.type === "video";
  if (section === "Field Notes") return footprint;
  return true;
}

function dateLabel(value) {
  if (!value) return "UNSCHEDULED";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(value)).toUpperCase();
}

function dayLabel(value) {
  if (!value) return "UNSCHEDULED";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(value)).toUpperCase();
}

function archiveByDate(items) {
  const years = new Map();
  items.forEach((item) => {
    const date = new Date(item.publishedAt || item.createdAt || 0);
    const year = Number.isNaN(date.getTime()) ? "UNSCHEDULED" : String(date.getUTCFullYear());
    const monthNumber = Number.isNaN(date.getTime()) ? -1 : date.getUTCMonth();
    const month = Number.isNaN(date.getTime()) ? "Unscheduled" : new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(date);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(monthNumber)) months.set(monthNumber, { label: month, items: [] });
    months.get(monthNumber).items.push(item);
  });
  return [...years.entries()].map(([year, months]) => ({
    year,
    months: [...months.entries()].sort(([left], [right]) => right - left).map(([monthNumber, value]) => ({ ...value, monthNumber })),
  }));
}

export function ContentHub({ section, contents, onSelect, onPublish, onEdit, onDuplicate, onStatusChange, onDelete, canManage = () => false, canPublish }) {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [workspaceStatus, setWorkspaceStatus] = useState("all");
  useEffect(() => {
    setQuery("");
    setSelectedTag("all");
  }, [section]);
  const sectionItems = useMemo(() => contents
    .filter((item) => section === "Workspace" || item.status === "published")
    .filter((item) => belongsToSection(item, section))
    .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0)), [contents, section]);
  const tags = useMemo(() => {
    const values = new Map();
    sectionItems.forEach((item) => meaningfulContentTags(item).forEach((tag) => values.set(tag.slug, tag.name || tag.slug)));
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [sectionItems]);
  const items = useMemo(() => sectionItems
    .filter((item) => selectedTag === "all" || item.tags?.some((tag) => tag.slug === selectedTag))
    .filter((item) => `${item.title} ${item.summary} ${item.bodyMarkdown ?? ""} ${item.tags?.map((tag) => `${tag.slug} ${tag.name}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [query, sectionItems, selectedTag]);
  const archive = useMemo(() => archiveByDate(items), [items]);

  if (section === "Workspace") {
    const statusCounts = {
      all: contents.length,
      draft: contents.filter((item) => item.status === "draft").length,
      published: contents.filter((item) => item.status === "published").length,
      archived: contents.filter((item) => item.status === "archived").length,
    };
    const workspaceItems = sectionItems
      .filter((item) => workspaceStatus === "all" || item.status === workspaceStatus)
      .filter((item) => `${item.type} ${item.title} ${item.summary} ${item.slug}`.toLowerCase().includes(query.trim().toLowerCase()));
    return (
      <section className="content-hub workspace-hub">
        <div className="hub-heading workspace-heading">
          <div><div className="eyebrow">OWNER WORKSPACE</div><h1>Publishing control,<br />without dashboard noise.</h1></div>
          <PrimarySpecularButton size="sm" onClick={onPublish}><Plus size={16} />New content</PrimarySpecularButton>
        </div>
        <div className="workspace-metrics">
          {[["all", "All content"], ["draft", "Drafts"], ["published", "Published"], ["archived", "Archived"]].map(([status, label]) => (
            <button key={status} type="button" className={workspaceStatus === status ? "active" : ""} onClick={() => setWorkspaceStatus(status)} aria-pressed={workspaceStatus === status}>
              <small>{label}</small><strong>{String(statusCounts[status]).padStart(2, "0")}</strong>
            </button>
          ))}
        </div>
        <div className="workspace-toolbar">
          <label className="specular-search"><MagnifyingGlass size={16} /><input aria-label="Search workspace content" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, slug, summary, or type" /></label>
          <span>{workspaceItems.length} / {contents.length} entries</span>
        </div>
        <div className="workspace-list">
          <div className="workspace-row workspace-labels"><span>TYPE / TITLE</span><span>VISIBILITY</span><span>STATUS</span><span>UPDATED</span><span>ACTIONS</span></div>
          {workspaceItems.map((item) => (
            <article key={item.id} className="workspace-row workspace-content-row">
              <button className="workspace-title-action" type="button" onClick={() => onSelect(item)} title="Preview content">
                <em>{item.type}</em><span>{item.title}</span><small>/{item.slug}</small>
              </button>
              <span>{item.visibility}</span>
              <span className={`workspace-status status-${item.status}`}>{item.status}</span>
              <span>{dateLabel(item.updatedAt ?? item.publishedAt)}</span>
              <div className="workspace-actions" aria-label={`Actions for ${item.title}`}>
                <button type="button" onClick={() => onSelect(item)}>Preview</button>
                <button type="button" onClick={() => onDuplicate(item)}>Duplicate</button>
                {canManage(item) ? <>
                  <button type="button" onClick={() => onEdit(item)}>Edit</button>
                  <button type="button" onClick={() => onStatusChange(item, item.status === "published" ? "draft" : "published")}>{item.status === "published" ? "Unpublish" : "Publish"}</button>
                  {item.status !== "archived" ? <button type="button" onClick={() => onStatusChange(item, "archived")}>Archive</button> : null}
                  <button className="danger" type="button" onClick={() => onDelete(item)}>Delete</button>
                </> : null}
              </div>
            </article>
          ))}
          {!workspaceItems.length ? <div className="workspace-empty">No content matches this view.</div> : null}
        </div>
      </section>
    );
  }

  const icon = section === "Thoughts" ? <Quotes /> : section === "Gallery" ? <ImageSquare /> : section === "Field Notes" ? <MapPin /> : <FileText />;

  return (
    <section className={`content-hub content-archive-hub${section === "Gallery" ? " gallery-hub" : ""}`}>
      <div className="hub-tools archive-tools">
        <label className="specular-search"><MagnifyingGlass size={16} /><input aria-label={`Search ${section}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section.toLowerCase()}`} /></label>
        {section === "Essays" ? (
          <SpecularButton {...specularControlProps} className="archive-specular-control" aria-label="Open RSS feed" href="/rss.xml" target="_blank" rel="noreferrer"><RssSimple size={15} />RSS</SpecularButton>
        ) : null}
        {section === "Field Notes" && canPublish ? <SpecularButton {...specularControlProps} className="archive-specular-control" onClick={onPublish}><Plus size={15} />Publish</SpecularButton> : null}
      </div>

      {tags.length ? (
        <div className="archive-tags" role="group" aria-label={`Filter ${section} by tag`}>
          <SpecularButton
            {...specularControlProps}
            className={`archive-tag-specular${selectedTag === "all" ? " active" : ""}`}
            tintOpacity={selectedTag === "all" ? 0.085 : 0.012}
            baseColor={selectedTag === "all" ? "#8b5bd1" : "#302c35"}
            textColor={selectedTag === "all" ? "#caa7ff" : "#77727d"}
            renderEffect={false}
            aria-pressed={selectedTag === "all"}
            onClick={() => setSelectedTag("all")}
          >All</SpecularButton>
          {tags.map(([slug, name]) => {
            const active = selectedTag === slug;
            return (
              <SpecularButton
                {...specularControlProps}
                key={slug}
                className={`archive-tag-specular${active ? " active" : ""}`}
                tintOpacity={active ? 0.085 : 0.012}
                baseColor={active ? "#8b5bd1" : "#302c35"}
                textColor={active ? "#caa7ff" : "#77727d"}
                renderEffect={false}
                aria-pressed={active}
                onClick={() => setSelectedTag(slug)}
              >#{name}</SpecularButton>
            );
          })}
        </div>
      ) : null}

      {section === "Gallery" ? (
        <div className="gallery-grid">
          {items.map((item, index) => {
            const cover = resolveContentCover(item);
            return (
            <button key={item.id} className="gallery-card" type="button" onClick={() => onSelect(item)}>
              <div className={`gallery-visual${cover ? " has-cover" : ""}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span>{cover ? <img src={cover.url} alt="" loading="lazy" /> : icon}</div>
              <div><small>{dateLabel(item.publishedAt)} · {item.tags?.find((tag) => tag.slug === "media")?.properties?.kind ?? "MEDIA"}</small><h2>{item.title}</h2><p>{item.summary}</p></div>
            </button>
          );})}
        </div>
      ) : (
        <div className="archive-index-shell">
          <nav className="archive-jump" aria-label="Jump to archive date">
            {archive.map((yearGroup) => <div key={yearGroup.year}><button type="button" onClick={() => document.getElementById(`archive-${yearGroup.year}`)?.scrollIntoView({ behavior: "smooth" })}>{yearGroup.year}</button>{yearGroup.months.map((month) => <button key={month.monthNumber} type="button" onClick={() => document.getElementById(`archive-${yearGroup.year}-${month.monthNumber}`)?.scrollIntoView({ behavior: "smooth" })}>{month.label.slice(0, 3)}</button>)}</div>)}
          </nav>
          <div className="archive-index">
          {archive.map((yearGroup) => (
            <section className="archive-year" id={`archive-${yearGroup.year}`} key={yearGroup.year}>
              <header className="archive-year-marker"><strong>{yearGroup.year}</strong><span>{yearGroup.months.reduce((total, month) => total + month.items.length, 0)} entries</span></header>
              <div className="archive-month-list">
                {yearGroup.months.map((monthGroup) => (
                  <section className="archive-month" id={`archive-${yearGroup.year}-${monthGroup.monthNumber}`} key={`${yearGroup.year}-${monthGroup.label}`}>
                    <header><h2>{monthGroup.label}</h2><span>{String(monthGroup.items.length).padStart(2, "0")}</span></header>
                    <AnimatedList className="content-index" items={monthGroup.items} renderItem={(item, index) => {
                      const cover = resolveContentCover(item);
                      return (
                        <button key={item.id} className="content-row" type="button" onClick={() => onSelect(item)}>
                          <span className="content-index-number">{String(index + 1).padStart(2, "0")}</span>
                          <span className={`content-index-icon${cover ? " has-cover" : ""}`}>{cover ? <img src={cover.url} alt="" loading="lazy" /> : icon}</span>
                          <span className="content-row-copy"><small>{dayLabel(item.publishedAt)} · {meaningfulContentTags(item).map((tag) => `#${tag.slug}`).join(" ")}</small><strong>{item.title}</strong><span>{item.summary}</span></span>
                          {item.locked ? <LockKey className="row-action" size={18} /> : <ArrowUpRight className="row-action" size={18} />}
                        </button>
                      );}} />
                  </section>
                ))}
              </div>
            </section>
          ))}
          </div>
        </div>
      )}
      {!items.length ? <div className="empty-module">No published {section.toLowerCase()} match this view yet.</div> : null}
    </section>
  );
}
