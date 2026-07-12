import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, Show } from "solid-js";
import { useAuth, canManageUsers } from "../../shared/auth-context";
import {
  DocumentationContent,
  DocumentationHeaderTabs,
  DocumentationHome,
  DocumentationNav,
  KnowledgebaseHome,
  KnowledgebaseNav,
} from "./DocumentationLayout";
import { documentationGroups } from "./documentationGroups";
import {
  documentationSections,
  getDocSection,
  orderedSectionIds,
} from "./documentationSections";
import {
  getKbArticle,
  knowledgebaseArticles,
  orderedKbArticleIds,
} from "./knowledgebaseArticles";
import { knowledgebaseGroups } from "./knowledgebaseGroups";
import { kbArticlesForSection } from "./sectionKbCrossRefs";

export default function DocumentationPage() {
  const params = useParams<{ sectionId?: string; articleId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const isKb = () => location.pathname.includes("/documentation/kb");

  const sectionsById = createMemo(() => new Map(documentationSections.map((s) => [s.id, s])));
  const articlesById = createMemo(() => new Map(knowledgebaseArticles.map((a) => [a.id, a])));

  const isGuidesHome = () => !isKb() && !params.sectionId;
  const isKbHome = () => isKb() && !params.articleId;

  const sectionId = () => {
    if (isKb()) return null;
    const id = params.sectionId;
    if (!id) return null;
    return sectionsById().has(id) ? id : null;
  };

  const articleId = () => {
    if (!isKb()) return null;
    const id = params.articleId;
    if (!id) return null;
    return articlesById().has(id) ? id : null;
  };

  const section = () => {
    const id = sectionId();
    return id ? getDocSection(id) : null;
  };

  const article = () => {
    const id = articleId();
    return id ? getKbArticle(id) : null;
  };

  createEffect(() => {
    if (isKb()) {
      const id = params.articleId;
      if (id && !articlesById().has(id)) {
        navigate("/app/documentation/kb", { replace: true });
      }
      return;
    }
    const id = params.sectionId;
    if (id && !sectionsById().has(id)) {
      navigate("/app/documentation", { replace: true });
    }
  });

  const selectSection = (id: string) => {
    navigate(`/app/documentation/${id}`);
  };

  const selectArticle = (id: string) => {
    navigate(`/app/documentation/kb/${id}`);
  };

  const goGuidesHome = () => {
    navigate("/app/documentation");
  };

  const goKbHome = () => {
    navigate("/app/documentation/kb");
  };

  const guideNeighbors = createMemo(() => {
    const id = sectionId();
    if (!id) return {};
    const order = orderedSectionIds();
    const idx = order.indexOf(id);
    if (idx < 0) return {};
    const prev = idx > 0 ? order[idx - 1] : undefined;
    const next = idx < order.length - 1 ? order[idx + 1] : undefined;
    const map = sectionsById();
    return {
      prev: prev ? { id: prev, title: map.get(prev)?.title ?? prev } : undefined,
      next: next ? { id: next, title: map.get(next)?.title ?? next } : undefined,
    };
  });

  const kbNeighbors = createMemo(() => {
    const id = articleId();
    if (!id) return {};
    const order = orderedKbArticleIds();
    const idx = order.indexOf(id);
    if (idx < 0) return {};
    const prev = idx > 0 ? order[idx - 1] : undefined;
    const next = idx < order.length - 1 ? order[idx + 1] : undefined;
    const map = articlesById();
    return {
      prev: prev ? { id: prev, title: map.get(prev)?.title ?? prev } : undefined,
      next: next ? { id: next, title: map.get(next)?.title ?? next } : undefined,
    };
  });

  const adminNote = () =>
    section()?.id === "admin" && !canManageUsers(auth.me)
      ? "You may need administrator access to use these screens. Ask your store owner if you need help."
      : undefined;

  return (
    <div class="mx-auto max-w-6xl">
      <DocumentationHeaderTabs active={isKb() ? "knowledgebase" : "guides"} />

      <Show
        when={isKb()}
        fallback={
          <Show
            when={!isGuidesHome()}
            fallback={
              <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
                <DocumentationNav
                  groups={documentationGroups}
                  sectionsById={sectionsById()}
                  activeId=""
                  onSelect={selectSection}
                  onHome={goGuidesHome}
                />
                <div class="min-w-0 flex-1">
                  <DocumentationHome
                    groups={documentationGroups}
                    sectionsById={sectionsById()}
                    onSelect={selectSection}
                  />
                </div>
              </div>
            }
          >
            <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
              <DocumentationNav
                groups={documentationGroups}
                sectionsById={sectionsById()}
                activeId={sectionId() ?? ""}
                onSelect={selectSection}
                onHome={goGuidesHome}
              />
              <div class="min-w-0 flex-1 rounded-xl border border-stroke bg-white p-6 shadow-sm lg:p-8">
                <Show when={section()}>
                  {(s) => (
                    <DocumentationContent
                      title={s().title}
                      intro={s().intro}
                      blocks={s().blocks}
                      primaryHref={s().primaryHref}
                      primaryLabel={s().primaryLabel}
                      adminNote={adminNote()}
                      relatedKbArticleIds={kbArticlesForSection(s().id)}
                      articlesById={articlesById()}
                      prev={guideNeighbors().prev}
                      next={guideNeighbors().next}
                      onNavigate={selectSection}
                    />
                  )}
                </Show>
              </div>
            </div>
          </Show>
        }
      >
        <Show
          when={!isKbHome()}
          fallback={
            <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
              <KnowledgebaseNav
                groups={knowledgebaseGroups}
                articlesById={articlesById()}
                activeId=""
                onSelect={selectArticle}
                onHome={goKbHome}
              />
              <div class="min-w-0 flex-1">
                <KnowledgebaseHome
                  groups={knowledgebaseGroups}
                  articlesById={articlesById()}
                  onSelect={selectArticle}
                />
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
            <KnowledgebaseNav
              groups={knowledgebaseGroups}
              articlesById={articlesById()}
              activeId={articleId() ?? ""}
              onSelect={selectArticle}
              onHome={goKbHome}
            />
            <div class="min-w-0 flex-1 rounded-xl border border-stroke bg-white p-6 shadow-sm lg:p-8">
              <Show when={article()}>
                {(a) => (
                  <DocumentationContent
                    title={a().title}
                    scenario={a().scenario}
                    intro={a().intro}
                    blocks={a().blocks}
                    primaryHref={a().primaryHref}
                    primaryLabel={a().primaryLabel}
                    relatedGuideIds={a().relatedGuideIds}
                    sectionsById={sectionsById()}
                    prev={kbNeighbors().prev}
                    next={kbNeighbors().next}
                    onNavigate={selectArticle}
                    onNavigateGuide={selectSection}
                  />
                )}
              </Show>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
