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
import {
  createContent,
  deleteContent,
  deleteKnowledgeBase,
  deleteKnowledgePage,
  getContent,
  getKnowledgePage,
  getSession,
  listContents,
  listFootprints,
  listKnowledgeBases,
  listKnowledgePages,
  logout,
  updateContent,
  updateKnowledgePage,
} from "./lib/api.js";
import { publicModules } from "./modules/registry.js";
import { parseAppRoute, routeForContent, routeForKnowledge, routeForView, viewForContent } from "./lib/routes.js";

const PublishFootprintDialog = lazy(() => import("./components/PublishFootprintDialog.jsx").then((module) => ({ default: module.PublishFootprintDialog })));
const ArticleReader = lazy(() => import("./components/ArticleReader.jsx").then((module) => ({ default: module.ArticleReader })));
const KnowledgeHub = lazy(() => import("./components/KnowledgeHub.jsx").then((module) => ({ default: module.KnowledgeHub })));
const MediaLibrary = lazy(() => import("./components/MediaLibrary.jsx").then((module) => ({ default: module.MediaLibrary })));

function publicationTimestamp(item) {
  const timestamp = Date.parse(item?.publishedAt ?? item?.updatedAt ?? item?.createdAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestPublished(items, predicate) {
  return items
    .filter((item) => item.status === "published" && predicate(item))
    .sort((left, right) => publicationTimestamp(right) - publicationTimestamp(left))[0] ?? null;
}

function syncBrowserRoute(path, { replace = false } = {}) {
  if (window.location.pathname === path) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
}

export function App() {
  const initialRoute = useMemo(() => parseAppRoute(window.location.pathname), []);
  const [footprints, setFootprints] = useState([]);
  const [contents, setContents] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [knowledgePages, setKnowledgePages] = useState([]);
  const [view, setView] = useState(initialRoute.view);
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [composerContext, setComposerContext] = useState({ mode: "create", sourceSlug: "", initialValue: null });
  const [readerArticle, setReaderArticle] = useState(null);
  const [readerOriginView, setReaderOriginView] = useState(initialRoute.view);
  const [signInOpen, setSignInOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState(null);
  const [authReason, setAuthReason] = useState("");
  const [pendingArticleSlug, setPendingArticleSlug] = useState("");
  const [editorialCollapsed, setEditorialCollapsed] = useState(false);
  const [portraitLayout, setPortraitLayout] = useState(() => window.matchMedia("(orientation: portrait) and (max-width: 1100px)").matches);
  const [knowledgeTarget, setKnowledgeTarget] = useState({ baseSlug: initialRoute.baseSlug, pageSlug: initialRoute.pageSlug, startEditing: false });

  useEffect(() => {
    const portraitQuery = window.matchMedia("(orientation: portrait) and (max-width: 1100px)");
    const updatePortraitLayout = () => setPortraitLayout(portraitQuery.matches);
    updatePortraitLayout();
    portraitQuery.addEventListener("change", updatePortraitLayout);
    return () => portraitQuery.removeEventListener("change", updatePortraitLayout);
  }, []);

  const refreshKnowledgeWorkspace = async () => {
    const bases = await listKnowledgeBases();
    const pageGroups = await Promise.all(bases.map(async (base) => ({ base, pages: await listKnowledgePages(base.slug) })));
    setKnowledgeBases(bases);
    setKnowledgePages(pageGroups.flatMap(({ base, pages }) => pages.map((page) => ({
      ...page,
      knowledgeBaseSlug: base.slug,
      knowledgeBaseTitle: base.title,
    }))));
  };

  const refreshContentCollections = async (account = user) => {
    const publisher = ["editor", "admin"].includes(account?.role);
    const [mappedItems, allItems] = await Promise.all([listFootprints(), listContents(publisher ? { status: "all" } : {})]);
    setFootprints(mappedItems);
    setContents(allItems);
  };

  // The knowledge reader keeps its own tree state for fast navigation, while
  // the owner workspace consumes the unified /contents feed. Refresh both
  // projections after any knowledge mutation so a create, edit, or delete is
  // visible immediately in either surface.
  const refreshWorkspaceData = async (account = user) => {
    await Promise.all([refreshContentCollections(account), refreshKnowledgeWorkspace()]);
  };

  useEffect(() => {
    let cancelled = false;
    getSession().catch(() => null).then(async (account) => {
      setUser(account);
      await refreshWorkspaceData(account);
      const route = parseAppRoute(window.location.pathname);
      if (!route.contentSlug || cancelled) return;
      try {
        const article = await getContent(route.contentSlug);
        if (!cancelled) {
          setReaderOriginView(route.view);
          setReaderArticle(article);
        }
      } catch (error) {
        if (!cancelled && error?.status === 401) requireAuth("Sign in to unlock this member-only field note.", route.contentSlug);
      }
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Content could not be loaded."));
    return () => { cancelled = true; };
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
    setReaderOriginView(view);
    setReaderArticle(saved);
    syncBrowserRoute(routeForContent(saved), { replace: composerContext.mode === "edit" });
    setNotice(composerContext.mode === "edit" ? "Changes saved" : input.status === "draft" ? "Draft saved" : "Content published");
  };

  const requireAuth = (reason, articleSlug = "") => {
    setAuthReason(reason);
    setPendingArticleSlug(articleSlug);
    setSignInOpen(true);
  };

  const openArticle = async (article, { syncRoute = true, originView = view } = {}) => {
    if (!article) return;
    if (syncRoute) {
      setReaderOriginView(originView);
      syncBrowserRoute(routeForContent(article));
    }
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

  useEffect(() => {
    const applyRoute = () => {
      const route = parseAppRoute(window.location.pathname);
      setView(route.view);
      setKnowledgeTarget({ baseSlug: route.baseSlug, pageSlug: route.pageSlug, startEditing: false });
      if (!route.contentSlug) {
        setReaderArticle(null);
        return;
      }
      const article = contents.find((item) => item.slug === route.contentSlug);
      if (article) void openArticle(article, { syncRoute: false, originView: route.view });
    };
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, [contents]);

  useEffect(() => {
    const route = parseAppRoute(window.location.pathname);
    if (!route.contentSlug || !contents.length || readerArticle?.slug === route.contentSlug) return;
    const article = contents.find((item) => item.slug === route.contentSlug);
    if (article) void openArticle(article, { syncRoute: false, originView: route.view });
  }, [contents]);

  // A shared public URL must be readable on its own initial request, before
  // archive data has necessarily finished hydrating. The list lookup above
  // keeps in-app navigation fast; this direct read is the durable fallback.
  useEffect(() => {
    const route = parseAppRoute(window.location.pathname);
    if (!route.contentSlug || readerArticle?.slug === route.contentSlug) return undefined;
    let cancelled = false;
    getContent(route.contentSlug)
      .then((article) => {
        if (!cancelled) void openArticle(article, { syncRoute: false, originView: route.view });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401) requireAuth("Sign in to unlock this member-only field note.", route.contentSlug);
      });
    return () => { cancelled = true; };
  }, [contents.length, readerArticle?.slug]);

  const authenticated = async (authenticatedUser) => {
    setUser(authenticatedUser);
    await refreshWorkspaceData(authenticatedUser);
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
    syncBrowserRoute("/", { replace: true });
    await refreshWorkspaceData(null);
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

  const openKnowledge = (entry, edit = false) => {
    setKnowledgeTarget({
      baseSlug: entry.knowledgeBaseSlug,
      pageSlug: entry.workspaceKind === "knowledge-page" ? entry.slug : "",
      startEditing: edit && entry.workspaceKind === "knowledge-page",
    });
    setView("Knowledge");
    syncBrowserRoute(routeForKnowledge(entry.knowledgeBaseSlug, entry.workspaceKind === "knowledge-page" ? entry.slug : ""));
  };

  const changeKnowledgePageStatus = async (page, status) => {
    try {
      const current = await getKnowledgePage(page.knowledgeBaseSlug, page.slug);
      await updateKnowledgePage(page.knowledgeBaseSlug, page.slug, {
        parentId: current.parentId,
        title: current.title,
        slug: current.slug,
        summary: current.summary,
        bodyMarkdown: current.bodyMarkdown,
        position: current.position,
        status,
        visibility: current.visibility,
      });
      await refreshWorkspaceData();
      setNotice(status === "published" ? "Knowledge document published" : status === "archived" ? "Knowledge document archived" : "Knowledge document moved to drafts");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Knowledge document status could not be changed.");
    }
  };

  const removeKnowledge = async (entry) => {
    const target = entry.workspaceKind === "knowledge-base" ? "this knowledge base and every document inside it" : `“${entry.title}”`;
    if (!window.confirm(`Delete ${target}? This cannot be undone.`)) return;
    try {
      if (entry.workspaceKind === "knowledge-base") await deleteKnowledgeBase(entry.knowledgeBaseSlug);
      else await deleteKnowledgePage(entry.knowledgeBaseSlug, entry.slug);
      await refreshWorkspaceData();
      setNotice(entry.workspaceKind === "knowledge-base" ? "Knowledge base deleted" : "Knowledge document deleted");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Knowledge content could not be deleted.");
    }
  };

  const navigate = (item) => {
    window.scrollTo(0, 0);
    setView(item);
    setReaderArticle(null);
    if (item !== "Knowledge") setKnowledgeTarget({ baseSlug: "", pageSlug: "", startEditing: false });
    syncBrowserRoute(routeForView(item));
  };

  const closeArticle = () => {
    window.scrollTo(0, 0);
    setReaderArticle(null);
    const returnView = readerOriginView === "Home" ? "Home" : viewForContent(readerArticle);
    setView(returnView);
    syncBrowserRoute(routeForView(returnView));
  };

  const featuredEssay = latestPublished(contents, (item) => item.type === "article" && !item.tags?.some((tag) => tag.slug === "footprint"));
  const featuredThought = latestPublished(contents, (item) => item.type === "thought");
  const canPublish = ["editor", "admin"].includes(user?.role);
  const mobileNavItems = useMemo(() => [
    { label: "Read", links: publicModules.filter((module) => ["Essays", "Thoughts"].includes(module.view)).map((module) => ({ label: module.label, view: module.view })) },
    { label: "Explore", links: publicModules.filter((module) => !["Essays", "Thoughts"].includes(module.view)).map((module) => ({ label: module.label, view: module.view })) },
  ], []);

  return (
    <div className={`site-shell${editorialCollapsed ? " editorial-collapsed" : ""}${view === "Knowledge" && knowledgeTarget.baseSlug ? " knowledge-reader-active" : ""}`}>
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
        onAccount={() => user ? navigate("Workspace") : requireAuth("")}
      />
      <header className="topbar">
        <button className="brand" type="button" aria-label="B.C home" onClick={() => navigate("Home") }>
          <span className="brand-dot-matrix" aria-hidden="true">B.C</span>
        </button>
        <nav aria-label="Primary navigation">
          {publicModules.map((module) => (
            <button key={module.id} type="button" className={(view === "Home" ? module.view === "Essays" : view === module.view) ? "active" : ""} onClick={() => navigate(module.view)}>{module.label}</button>
          ))}
        </nav>
        {user ? (
          <div className="account-area">
            <button className="workspace-trigger" type="button" onClick={() => navigate("Workspace")}><LockKey size={13} />{user.displayName}</button>
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
            <h1>{featuredEssay?.title ?? "Publish your first essay."}</h1>
            <p className="hero-summary">{featuredEssay?.summary ?? "The newest published essay appears here automatically."}</p>
            {featuredEssay ? (
              <button className="read-action" type="button" onClick={() => openArticle(featuredEssay)}>
                Read the essay <ArrowRight size={21} weight="light" />
              </button>
            ) : null}
          </div>
          {featuredThought ? (
            <button className="thought-row" type="button" onClick={() => openArticle(featuredThought)}>
              <strong>THOUGHT</strong><span className="thought-dash" />
              <span>{featuredThought.title}</span>
              <CaretRight size={17} />
            </button>
          ) : null}
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
            expanded={editorialCollapsed || portraitLayout}
            clickable
            animateFormation={!editorialCollapsed && !portraitLayout}
            landscapeFill
          />
        </section>
      </main> : view === "Knowledge" ? (
        <Suspense fallback={<div className="module-loading">Loading knowledge…</div>}><KnowledgeHub key={`knowledge-${knowledgeTarget.baseSlug}-${knowledgeTarget.pageSlug}-${knowledgeTarget.startEditing ? "edit" : "read"}`} user={user} onRequireAuth={requireAuth} initialBaseSlug={knowledgeTarget.baseSlug} initialPageSlug={knowledgeTarget.pageSlug} startEditing={knowledgeTarget.startEditing} onWorkspaceChange={() => refreshWorkspaceData()} onHome={() => navigate("Home")} onRouteChange={(baseSlug, pageSlug) => { setKnowledgeTarget({ baseSlug, pageSlug, startEditing: false }); syncBrowserRoute(routeForKnowledge(baseSlug, pageSlug)); }} /></Suspense>
      ) : view === "Media Library" ? (
        <Suspense fallback={<div className="module-loading">Loading media library…</div>}><MediaLibrary key={view} onBack={() => navigate("Workspace")} /></Suspense>
      ) : (
        <ContentHub
          key={view}
          section={view}
          contents={contents}
          knowledgeBases={knowledgeBases}
          knowledgePages={knowledgePages}
          onSelect={openArticle}
          onPublish={() => openPublisher("create")}
          onEdit={(article) => openPublisher("edit", article)}
          onDuplicate={(article) => openPublisher("duplicate", article)}
          onStatusChange={changeContentStatus}
          onDelete={removeContent}
          onOpenKnowledge={openKnowledge}
          onEditKnowledge={(entry) => openKnowledge(entry, true)}
          onStatusChangeKnowledge={changeKnowledgePageStatus}
          onDeleteKnowledge={removeKnowledge}
          onOpenMediaLibrary={() => navigate("Media Library")}
          canManage={(article) => Boolean(user && (user.role === "admin" || article.authorId === user.id))}
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
        <ArticleReader article={readerArticle} onClose={closeArticle} user={user} footprints={footprints} canEdit={Boolean(user && readerArticle && (user.role === "admin" || readerArticle.authorId === user.id))} onEdit={(article) => { setReaderArticle(null); openPublisher("edit", article); }} />
      </Suspense>
      <AuthDialog open={signInOpen} reason={authReason} onClose={() => setSignInOpen(false)} onAuthenticated={authenticated} />
    </div>
  );
}
