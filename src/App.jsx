import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  LockKey,
  SignOut,
} from "@phosphor-icons/react";
import { PixelWorldMap } from "./components/PixelWorldMap.jsx";
import { CardNav } from "./components/CardNav.jsx";
import { AuthDialog } from "./components/AuthDialog.jsx";
import { ContentHub } from "./components/ContentHub.jsx";
import { createContent, deleteContent, getContent, getSession, listContents, listFootprints, logout, updateContent } from "./lib/api.js";
import { publicModules } from "./modules/registry.js";

const PublishFootprintDialog = lazy(() => import("./components/PublishFootprintDialog.jsx").then((module) => ({ default: module.PublishFootprintDialog })));
const ArticleReader = lazy(() => import("./components/ArticleReader.jsx").then((module) => ({ default: module.ArticleReader })));
const KnowledgeHub = lazy(() => import("./components/KnowledgeHub.jsx").then((module) => ({ default: module.KnowledgeHub })));

export function App() {
  const [footprints, setFootprints] = useState([]);
  const [contents, setContents] = useState([]);
  const [view, setView] = useState("Home");
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [composerContext, setComposerContext] = useState({ mode: "create", sourceSlug: "", initialValue: null });
  const [readerArticle, setReaderArticle] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState(null);
  const [authReason, setAuthReason] = useState("");
  const [pendingArticleSlug, setPendingArticleSlug] = useState("");
  const [editorialCollapsed, setEditorialCollapsed] = useState(false);

  useEffect(() => {
    getSession().catch(() => null).then(async (account) => {
      setUser(account);
      const publisher = ["editor", "admin"].includes(account?.role);
      const [mappedItems, allItems] = await Promise.all([listFootprints(), listContents(publisher ? { status: "all" } : {})]);
      setFootprints(mappedItems);
      setContents(allItems);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Content could not be loaded."));
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const contentPayload = (input) => {
    const ordinaryTags = input.tags.map((tag) => ({ slug: tag, name: tag, properties: {} }));
    const typedTags = [];
    if (input.kind === "footprint") {
      typedTags.push({
        slug: "footprint",
        name: "Footprint",
        properties: { latitude: Number(input.latitude), longitude: Number(input.longitude), location_name: input.locationName },
      });
    }
    if (input.mediaUrl) {
      typedTags.push({ slug: "media", name: "Media", properties: { url: input.mediaUrl, content_type: input.mediaType, kind: input.kind } });
    }
    if (input.coverUrl) {
      typedTags.push({ slug: "cover", name: "Cover", properties: { url: input.coverUrl, alt: input.coverAlt || input.title } });
    }
    return {
      type: input.kind === "footprint" ? "article" : input.kind,
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      status: input.status,
      visibility: input.visibility,
      tags: [...typedTags, ...ordinaryTags],
    };
  };

  const mergeSavedContent = (saved) => {
    setContents((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    const isPublishedFootprint = saved.status === "published" && saved.tags?.some((tag) => tag.slug === "footprint");
    setFootprints((current) => isPublishedFootprint
      ? [saved, ...current.filter((item) => item.id !== saved.id)]
      : current.filter((item) => item.id !== saved.id));
  };

  const saveContent = async (input) => {
    const payload = contentPayload(input);
    const saved = composerContext.mode === "edit"
      ? await updateContent(composerContext.sourceSlug, payload)
      : await createContent(payload);
    mergeSavedContent(saved);
    setReaderArticle(saved);
    setNotice(composerContext.mode === "edit" ? "Changes saved" : input.status === "draft" ? "Draft saved" : "Content published");
  };

  const requireAuth = (reason, articleSlug = "") => {
    setAuthReason(reason);
    setPendingArticleSlug(articleSlug);
    setSignInOpen(true);
  };

  const openArticle = async (article) => {
    if (!article) return;
    if (article.locked) {
      requireAuth("Sign in to unlock this member-only field note.", article.slug);
      return;
    }
    if (article.bodyMarkdown) {
      setReaderArticle(article);
      return;
    }
    try {
      setReaderArticle(await getContent(article.slug));
    } catch (error) {
      if (error?.status === 401) requireAuth("Sign in to unlock this member-only field note.", article.slug);
      else setNotice(error instanceof Error ? error.message : "The article could not be opened.");
    }
  };

  const authenticated = async (authenticatedUser) => {
    setUser(authenticatedUser);
    const publisher = ["editor", "admin"].includes(authenticatedUser?.role);
    const [refreshedFootprints, refreshedContents] = await Promise.all([listFootprints(), listContents(publisher ? { status: "all" } : {})]);
    setFootprints(refreshedFootprints);
    setContents(refreshedContents);
    if (pendingArticleSlug) {
      try {
        setReaderArticle(await getContent(pendingArticleSlug));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The article could not be opened.");
      }
    }
    setPendingArticleSlug("");
    setAuthReason("");
  };

  const signOut = async () => {
    await logout();
    setUser(null);
    setView("Home");
    setReaderArticle(null);
    const [refreshedFootprints, refreshedContents] = await Promise.all([listFootprints(), listContents()]);
    setFootprints(refreshedFootprints);
    setContents(refreshedContents);
    setNotice("Signed out");
  };

  const openPublisher = (mode = "create", article = null) => {
    if (!user) {
      requireAuth("Sign in with an editor account to publish a footprint.");
      return;
    }
    if (!(["editor", "admin"].includes(user.role))) {
      setNotice("Editor access is required to publish.");
      return;
    }
    const footprint = article?.tags?.find((tag) => tag.slug === "footprint");
    const media = article?.tags?.find((tag) => tag.slug === "media");
    const cover = article?.tags?.find((tag) => tag.slug === "cover");
    const duplicateSlug = article
      ? `${article.slug}-copy${contents.some((item) => item.slug === `${article.slug}-copy`) ? `-${Date.now().toString(36)}` : ""}`
      : "";
    setComposerContext({
      mode,
      sourceSlug: mode === "edit" ? article?.slug ?? "" : "",
      initialValue: article ? {
        kind: footprint ? "footprint" : article.type,
        title: mode === "duplicate" ? `${article.title} — Copy` : article.title,
        slug: mode === "duplicate" ? duplicateSlug : article.slug,
        summary: article.summary,
        locationName: footprint?.properties?.location_name ?? "",
        latitude: footprint?.properties?.latitude ?? "",
        longitude: footprint?.properties?.longitude ?? "",
        visibility: article.visibility,
        status: mode === "duplicate" ? "draft" : article.status,
        tags: article.tags?.filter((tag) => !["footprint", "media", "cover"].includes(tag.slug)).map((tag) => tag.slug).join(", ") ?? "",
        bodyMarkdown: article.bodyMarkdown ?? "",
        mediaUrl: media?.properties?.url ?? "",
        mediaType: media?.properties?.content_type ?? "",
        coverUrl: cover?.properties?.url ?? "",
        coverAlt: cover?.properties?.alt ?? article.title,
      } : null,
    });
    setPublisherOpen(true);
  };

  const changeContentStatus = async (article, status) => {
    try {
      const saved = await updateContent(article.slug, {
        type: article.type,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        bodyMarkdown: article.bodyMarkdown,
        status,
        visibility: article.visibility,
        tags: article.tags ?? [],
      });
      mergeSavedContent(saved);
      setNotice(status === "published" ? "Content published" : status === "archived" ? "Content archived" : "Content moved to drafts");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Content status could not be changed.");
    }
  };

  const removeContent = async (article) => {
    if (!window.confirm(`Delete “${article.title}”? This cannot be undone.`)) return;
    try {
      await deleteContent(article.slug);
      setContents((current) => current.filter((item) => item.id !== article.id));
      setFootprints((current) => current.filter((item) => item.id !== article.id));
      if (readerArticle?.id === article.id) setReaderArticle(null);
      setNotice("Content deleted");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Content could not be deleted.");
    }
  };

  const navigate = (item) => {
    setView(item);
  };

  const featuredEssay = contents.find((item) => item.status === "published" && item.type === "article" && !item.tags?.some((tag) => tag.slug === "footprint")) ?? footprints[0];
  const featuredThought = contents.find((item) => item.status === "published" && item.type === "thought");
  const canPublish = ["editor", "admin"].includes(user?.role);
  const mobileNavItems = useMemo(() => [
    { label: "Read", links: publicModules.filter((module) => ["Essays", "Thoughts"].includes(module.view)).map((module) => ({ label: module.label, view: module.view })) },
    { label: "Explore", links: publicModules.filter((module) => !["Essays", "Thoughts"].includes(module.view)).map((module) => ({ label: module.label, view: module.view })) },
  ], []);

  return (
    <div className={`site-shell${editorialCollapsed ? " editorial-collapsed" : ""}`}>
      {view !== "Home" ? (
        <div className="ambient-footprint-layer" aria-hidden="true">
          <PixelWorldMap
            footprints={footprints}
            expanded
            ambient
            clickable={false}
            showLabels={false}
          />
        </div>
      ) : null}
      <CardNav
        items={mobileNavItems}
        activeView={view}
        onNavigate={navigate}
        accountLabel={user ? user.displayName : "Sign in"}
        onAccount={() => user ? setView("Workspace") : requireAuth("")}
      />
      <header className="topbar">
        <button className="brand" type="button" aria-label="B.C home" onClick={() => setView("Home") }>
          <span className="brand-dot-matrix" aria-hidden="true">B.C</span>
        </button>
        <nav aria-label="Primary navigation">
          {publicModules.map((module) => (
            <button key={module.id} type="button" className={(view === "Home" ? module.view === "Essays" : view === module.view) ? "active" : ""} onClick={() => navigate(module.view)}>{module.label}</button>
          ))}
        </nav>
        {user ? (
          <div className="account-area">
            <button className="workspace-trigger" type="button" onClick={() => setView("Workspace")}><LockKey size={13} />{user.displayName}</button>
            <button type="button" aria-label="Sign out" title="Sign out" onClick={signOut}><SignOut size={17} /></button>
          </div>
        ) : (
          <button className="signin-trigger" type="button" onClick={() => requireAuth("")}>
            Sign in <span aria-hidden="true" />
          </button>
        )}
      </header>

      {view === "Home" ? <main className="hero-layout view-enter">
        <section className="editorial-panel">
          <div className="editorial-content">
            <div className="eyebrow">FEATURED ESSAY</div>
            <h1>Building calm<br />systems in a<br />noisy world.</h1>
            <p className="hero-summary">Notes on software, infrastructure,<br />and deliberate practice.</p>
            <button className="read-action" type="button" onClick={() => openArticle(featuredEssay)}>
              Read the essay <ArrowRight size={21} weight="light" />
            </button>
          </div>
          <button className="thought-row" type="button" onClick={() => featuredThought ? openArticle(featuredThought) : setView("Thoughts") }>
            <strong>THOUGHT</strong><span className="thought-dash" />
            <span>Make complexity visible before making it clever.</span>
            <CaretRight size={17} />
          </button>
        </section>

        <div className="column-divider" aria-hidden="true" />
        <button
          className="collapse-control"
          type="button"
          aria-label={editorialCollapsed ? "Show featured essay" : "Hide featured essay"}
          title={editorialCollapsed ? "Show featured essay" : "Explore the full map"}
          aria-expanded={!editorialCollapsed}
          onClick={() => setEditorialCollapsed((current) => !current)}
        >
          {editorialCollapsed ? <CaretRight size={14} weight="light" /> : <CaretLeft size={14} weight="light" />}
        </button>

        <section className="map-panel">
          <PixelWorldMap
            footprints={footprints}
            onSelect={openArticle}
            selectedId={readerArticle?.id}
            expanded={editorialCollapsed}
            clickable
            animateFormation={!editorialCollapsed}
          />
        </section>
      </main> : view === "Knowledge" ? (
        <Suspense fallback={<div className="module-loading">Loading knowledge…</div>}><KnowledgeHub key={view} user={user} onRequireAuth={requireAuth} /></Suspense>
      ) : (
        <ContentHub
          key={view}
          section={view}
          contents={contents}
          onSelect={openArticle}
          onPublish={() => openPublisher("create")}
          onEdit={(article) => openPublisher("edit", article)}
          onDuplicate={(article) => openPublisher("duplicate", article)}
          onStatusChange={changeContentStatus}
          onDelete={removeContent}
          canManage={(article) => user?.role === "admin" || article.authorId === user?.id}
          canPublish={canPublish}
        />
      )}

      {notice ? <div className="toast" role="status">{notice}</div> : null}
      <Suspense fallback={null}>
        <PublishFootprintDialog
          open={publisherOpen}
          composerMode={composerContext.mode}
          initialValue={composerContext.initialValue}
          onClose={() => setPublisherOpen(false)}
          onSubmit={saveContent}
        />
        <ArticleReader article={readerArticle} onClose={() => setReaderArticle(null)} user={user} footprints={footprints} />
      </Suspense>
      <AuthDialog open={signInOpen} reason={authReason} onClose={() => setSignInOpen(false)} onAuthenticated={authenticated} />
    </div>
  );
}
