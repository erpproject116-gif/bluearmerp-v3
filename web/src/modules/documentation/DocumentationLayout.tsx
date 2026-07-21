import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { DocBlock, DocGroup, DocSection, KbArticle, KbGroup } from "./documentationTypes";
import { ModuleIcon } from "../../shell/ModuleIcon";
import { filterKbArticles, filterSections } from "./documentationSearch";
import { HelpAssistantAskButton } from "../help-assistant/HelpAssistantAskButton";
import { workflowGuides } from "../../shared/workflowGuides";

export type DocTab = "guides" | "knowledgebase";

export function DocumentationHeaderTabs(props: { active: DocTab }) {
  const tabClass = (tab: DocTab) =>
    [
      "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
      props.active === tab
        ? "border-brand-600 text-brand-700"
        : "border-transparent text-text-secondary hover:border-stroke hover:text-text-primary",
    ].join(" ");

  return (
    <div class="mb-6 border-b border-stroke" role="tablist" aria-label="Help content">
      <div class="flex gap-1">
        <A href="/app/documentation" class={tabClass("guides")} role="tab" aria-selected={props.active === "guides"}>
          Guides
        </A>
        <A
          href="/app/documentation/kb"
          class={tabClass("knowledgebase")}
          role="tab"
          aria-selected={props.active === "knowledgebase"}
        >
          Knowledge base
        </A>
      </div>
    </div>
  );
}

function DocBlockView(props: { block: DocBlock }) {
  return (
    <Show
      when={props.block.type === "heading"}
      fallback={
        <Show
          when={props.block.type === "steps"}
          fallback={
            <Show
              when={props.block.type === "tip"}
              fallback={
                <Show
                  when={props.block.type === "flow"}
                  fallback={
                    <p class="text-sm leading-relaxed text-text-primary">
                      {(props.block as Extract<DocBlock, { type: "paragraph" }>).text}
                    </p>
                  }
                >
                  <div class="flex flex-wrap items-center gap-1.5 rounded-lg border border-stroke bg-slate-50/80 px-3 py-2.5 text-sm text-text-primary">
                    <For each={(props.block as Extract<DocBlock, { type: "flow" }>).items}>
                      {(step, i) => (
                        <>
                          <Show when={i() > 0}>
                            <span class="text-text-secondary" aria-hidden="true">
                              →
                            </span>
                          </Show>
                          <span class="rounded-md bg-white px-2 py-0.5 font-medium shadow-sm">{step}</span>
                        </>
                      )}
                    </For>
                  </div>
                </Show>
              }
            >
              <div class="rounded-lg border border-brand-200/80 bg-brand-50/80 px-4 py-3 text-sm text-text-primary">
                <span class="font-medium text-brand-700">Tip — </span>
                {(props.block as Extract<DocBlock, { type: "tip" }>).text}
              </div>
            </Show>
          }
        >
          <ol class="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-primary">
            <For each={(props.block as Extract<DocBlock, { type: "steps" }>).items}>{(step) => <li>{step}</li>}</For>
          </ol>
        </Show>
      }
    >
      <h3 class="pt-2 text-base font-semibold text-text-primary">
        {(props.block as Extract<DocBlock, { type: "heading" }>).text}
      </h3>
    </Show>
  );
}

type ContentProps = {
  title: string;
  intro: string;
  blocks: DocBlock[];
  primaryHref?: string;
  primaryLabel?: string;
  adminNote?: string;
  scenario?: string;
  relatedGuideIds?: string[];
  relatedKbArticleIds?: string[];
  articlesById?: Map<string, KbArticle>;
  sectionsById?: Map<string, DocSection>;
  prev?: { id: string; title: string };
  next?: { id: string; title: string };
  onNavigate: (id: string) => void;
  onNavigateGuide?: (id: string) => void;
};

export function DocumentationContent(props: ContentProps) {
  return (
    <article class="min-w-0 flex-1">
      <Show when={props.adminNote}>
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.adminNote}</p>
      </Show>

      <header class="border-b border-stroke pb-5">
        <Show when={props.scenario}>
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">{props.scenario}</p>
        </Show>
        <h1 class="text-2xl font-semibold tracking-tight text-text-primary">{props.title}</h1>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{props.intro}</p>
      </header>

      <div class="mt-6 max-w-2xl space-y-4">
        <For each={props.blocks}>{(block) => <DocBlockView block={block} />}</For>
      </div>

      <Show when={props.primaryHref}>
        <div class="mt-8 max-w-2xl">
          <A
            href={props.primaryHref!}
            class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {props.primaryLabel ?? "Open this area"}
            <span aria-hidden="true">→</span>
          </A>
        </div>
      </Show>

      <Show when={props.relatedGuideIds?.length && props.sectionsById && props.onNavigateGuide}>
        <div class="mt-8 max-w-2xl rounded-lg border border-stroke bg-slate-50/80 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Related guides</p>
          <ul class="mt-2 space-y-1">
            <For each={props.relatedGuideIds}>
              {(guideId) => {
                const guide = props.sectionsById!.get(guideId);
                return (
                  <Show when={guide}>
                    {(g) => (
                      <li>
                        <button
                          type="button"
                          class="text-sm font-medium text-brand-600 hover:underline"
                          onClick={() => props.onNavigateGuide!(guideId)}
                        >
                          {g().title}
                        </button>
                      </li>
                    )}
                  </Show>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={props.relatedKbArticleIds?.length && props.articlesById}>
        <div class="mt-8 max-w-2xl rounded-lg border border-stroke bg-slate-50/80 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Related how-to articles</p>
          <ul class="mt-2 space-y-1">
            <For each={props.relatedKbArticleIds}>
              {(articleId) => {
                const article = props.articlesById!.get(articleId);
                return (
                  <Show when={article}>
                    {(a) => (
                      <li>
                        <A href={`/app/documentation/kb/${articleId}`} class="text-sm font-medium text-brand-600 hover:underline">
                          {a().title}
                        </A>
                      </li>
                    )}
                  </Show>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={props.prev || props.next}>
        <nav class="mt-10 flex max-w-2xl flex-wrap gap-3 border-t border-stroke pt-6" aria-label="Adjacent topics">
          <Show when={props.prev}>
            {(p) => (
              <button
                type="button"
                class="flex min-w-[10rem] flex-1 flex-col rounded-lg border border-stroke bg-white px-4 py-3 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50/50"
                onClick={() => props.onNavigate(p().id)}
              >
                <span class="text-xs text-text-secondary">Previous</span>
                <span class="font-medium text-text-primary">{p().title}</span>
              </button>
            )}
          </Show>
          <Show when={props.next}>
            {(n) => (
              <button
                type="button"
                class="flex min-w-[10rem] flex-1 flex-col rounded-lg border border-stroke bg-white px-4 py-3 text-right text-sm transition hover:border-brand-300 hover:bg-brand-50/50"
                onClick={() => props.onNavigate(n().id)}
              >
                <span class="text-xs text-text-secondary">Next</span>
                <span class="font-medium text-text-primary">{n().title}</span>
              </button>
            )}
          </Show>
        </nav>
      </Show>
    </article>
  );
}

type NavProps = {
  groups: DocGroup[];
  sectionsById: Map<string, DocSection>;
  activeId: string;
  onSelect: (id: string) => void;
  onHome: () => void;
};

export function DocumentationNav(props: NavProps) {
  const [query, setQuery] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  const filteredIds = createMemo(() => {
    const all = props.groups.flatMap((g) => g.sectionIds);
    const q = query().trim().toLowerCase();
    if (!q) return new Set(all);
    const matched = filterSections(
      all.map((id) => props.sectionsById.get(id)).filter((s): s is DocSection => !!s),
      q,
    ).map((s) => s.id);
    return new Set(matched);
  });

  const toggleGroup = (groupId: string) => {
    setCollapsed((c) => ({ ...c, [groupId]: !c[groupId] }));
  };

  const isGroupOpen = (group: DocGroup) => {
    if (query().trim()) return true;
    if (collapsed()[group.id] === true) return false;
    if (collapsed()[group.id] === false) return true;
    if (!props.activeId) return false;
    return group.sectionIds.includes(props.activeId);
  };

  return (
    <aside class="w-full shrink-0 lg:w-60 xl:w-64">
      <div class="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        <button
          type="button"
          class="mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-brand-600 transition hover:bg-brand-50"
          onClick={props.onHome}
        >
          <span aria-hidden="true">←</span>
          All topics
        </button>

        <label class="mb-3 block">
          <span class="sr-only">Search help topics</span>
          <input
            type="search"
            placeholder="Search help…"
            class="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>

        <nav class="space-y-4" aria-label="Help topics">
          <For each={props.groups}>
            {(group) => {
              const visibleSections = () =>
                group.sectionIds
                  .map((id) => props.sectionsById.get(id))
                  .filter((s): s is DocSection => !!s && filteredIds().has(s.id));
              return (
                <Show when={visibleSections().length > 0}>
                  <div>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isGroupOpen(group)}
                    >
                      {group.title}
                      <span class="text-[10px] normal-case font-normal text-text-secondary">{visibleSections().length}</span>
                    </button>
                    <Show when={isGroupOpen(group)}>
                      <ul class="mt-1 space-y-0.5 border-l border-stroke pl-2">
                        <For each={visibleSections()}>
                          {(section) => (
                            <li>
                              <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                                classList={{
                                  "bg-brand-50 font-medium text-brand-700": props.activeId === section.id,
                                  "text-text-secondary hover:bg-slate-50 hover:text-text-primary": props.activeId !== section.id,
                                }}
                                onClick={() => props.onSelect(section.id)}
                              >
                                <ModuleIcon id={section.iconId} class="h-3.5 w-3.5 shrink-0 opacity-70" />
                                <span class="truncate">{section.title}</span>
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              );
            }}
          </For>
        </nav>
      </div>
    </aside>
  );
}

type HomeProps = {
  groups: DocGroup[];
  sectionsById: Map<string, DocSection>;
  onSelect: (id: string) => void;
};

function WorkflowJourneys() {
  return (
    <section class="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
      <h2 class="text-sm font-semibold text-text-primary">Follow a workflow from start to finish</h2>
      <p class="mt-1 max-w-2xl text-xs leading-relaxed text-text-secondary">
        Not sure where to begin? Pick a journey below. Each one walks you through every step in order — what to do,
        why, and where to click. While you work on that flow, open{" "}
        <span class="font-semibold text-text-primary">Guide</span> in the header for the same steps (selling, buying,
        stock, accounting, CRM, projects, and more).
      </p>
      <div class="mt-3 grid gap-3 lg:grid-cols-3">
        <For each={workflowGuides}>
          {(guide) => (
            <div class="flex flex-col rounded-lg border border-stroke bg-white p-3 shadow-sm">
              <h3 class="text-sm font-semibold text-text-primary">{guide.title}</h3>
              <div class="mt-2 flex flex-wrap items-center gap-1 text-xs">
                <For each={guide.steps}>
                  {(step, i) => (
                    <>
                      <Show when={i() > 0}>
                        <span class="text-text-secondary/60" aria-hidden="true">
                          →
                        </span>
                      </Show>
                      <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-text-secondary">
                        {i() + 1}. {step.short}
                      </span>
                    </>
                  )}
                </For>
              </div>
              <p class="mt-2 flex-1 text-xs leading-relaxed text-text-secondary">{guide.summary}</p>
              <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-stroke pt-2 text-xs">
                <A href={guide.steps[0].href} class="font-medium text-brand-600 hover:underline">
                  Start at step 1 →
                </A>
                <Show when={guide.docHref}>
                  <A href={guide.docHref!} class="font-medium text-brand-600 hover:underline">
                    Read the full guide
                  </A>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

export function DocumentationHome(props: HomeProps) {
  return (
    <div class="space-y-8">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Guides</h1>
        <p class="mt-2 text-sm leading-relaxed text-text-secondary">
          Module-by-module reference grouped by what you are trying to do. For step-by-step scenarios (multiple
          businesses, branches, stock transfers), open the{" "}
          <A href="/app/documentation/kb" class="font-medium text-brand-600 hover:underline">
            Knowledge base
          </A>{" "}
          tab — or ask the help assistant for a quick answer.
        </p>
        <div class="mt-4">
          <HelpAssistantAskButton />
        </div>
      </header>

      <WorkflowJourneys />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <For each={props.groups}>
          {(group) => (
            <section class="flex flex-col rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">{group.title}</h2>
              <p class="mt-1 flex-1 text-xs leading-relaxed text-text-secondary">{group.description}</p>
              <ul class="mt-3 space-y-1 border-t border-stroke pt-3">
                <For each={group.sectionIds}>
                  {(id) => {
                    const section = props.sectionsById.get(id);
                    return (
                      <Show when={section}>
                        {(s) => (
                          <li>
                            <button
                              type="button"
                              class="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm text-brand-600 hover:bg-brand-50 hover:underline"
                              onClick={() => props.onSelect(s().id)}
                            >
                              <ModuleIcon id={s().iconId} class="h-3.5 w-3.5 shrink-0" />
                              {s().title}
                            </button>
                          </li>
                        )}
                      </Show>
                    );
                  }}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </div>
  );
}

type KbNavProps = {
  groups: KbGroup[];
  articlesById: Map<string, KbArticle>;
  activeId: string;
  onSelect: (id: string) => void;
  onHome: () => void;
};

export function KnowledgebaseNav(props: KbNavProps) {
  const [query, setQuery] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  const filteredIds = createMemo(() => {
    const all = props.groups.flatMap((g) => g.articleIds);
    const q = query().trim().toLowerCase();
    if (!q) return new Set(all);
    const matched = filterKbArticles(
      all.map((id) => props.articlesById.get(id)).filter((a): a is KbArticle => !!a),
      q,
    ).map((a) => a.id);
    return new Set(matched);
  });

  const toggleGroup = (groupId: string) => {
    setCollapsed((c) => ({ ...c, [groupId]: !c[groupId] }));
  };

  const isGroupOpen = (group: KbGroup) => {
    if (query().trim()) return true;
    if (collapsed()[group.id] === true) return false;
    if (collapsed()[group.id] === false) return true;
    if (!props.activeId) return false;
    return group.articleIds.includes(props.activeId);
  };

  return (
    <aside class="w-full shrink-0 lg:w-60 xl:w-64">
      <div class="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        <button
          type="button"
          class="mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-brand-600 transition hover:bg-brand-50"
          onClick={props.onHome}
        >
          <span aria-hidden="true">←</span>
          All scenarios
        </button>

        <label class="mb-3 block">
          <span class="sr-only">Search knowledge base</span>
          <input
            type="search"
            placeholder="Search scenarios…"
            class="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>

        <nav class="space-y-4" aria-label="Knowledge base scenarios">
          <For each={props.groups}>
            {(group) => {
              const visibleArticles = () =>
                group.articleIds
                  .map((id) => props.articlesById.get(id))
                  .filter((a): a is KbArticle => !!a && filteredIds().has(a.id));
              return (
                <Show when={visibleArticles().length > 0}>
                  <div>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isGroupOpen(group)}
                    >
                      {group.title}
                      <span class="text-[10px] font-normal normal-case text-text-secondary">
                        {visibleArticles().length}
                      </span>
                    </button>
                    <Show when={isGroupOpen(group)}>
                      <ul class="mt-1 space-y-0.5 border-l border-stroke pl-2">
                        <For each={visibleArticles()}>
                          {(article) => (
                            <li>
                              <button
                                type="button"
                                class="flex w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                                classList={{
                                  "bg-brand-50 font-medium text-brand-700": props.activeId === article.id,
                                  "text-text-secondary hover:bg-slate-50 hover:text-text-primary":
                                    props.activeId !== article.id,
                                }}
                                onClick={() => props.onSelect(article.id)}
                              >
                                <span class="line-clamp-2">{article.title}</span>
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              );
            }}
          </For>
        </nav>
      </div>
    </aside>
  );
}

type KbHomeProps = {
  groups: KbGroup[];
  articlesById: Map<string, KbArticle>;
  onSelect: (id: string) => void;
};

export function KnowledgebaseHome(props: KbHomeProps) {
  return (
    <div class="space-y-8">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Knowledge base</h1>
        <p class="mt-2 text-sm leading-relaxed text-text-secondary">
          Scenario-based answers for common “how do I…?” questions. Each article walks through one real-world situation
          step by step. For module overviews, use the{" "}
          <A href="/app/documentation" class="font-medium text-brand-600 hover:underline">
            Guides
          </A>{" "}
          tab — or ask the help assistant.
        </p>
        <div class="mt-4">
          <HelpAssistantAskButton />
        </div>
      </header>

      <div class="grid gap-4 sm:grid-cols-2">
        <For each={props.groups}>
          {(group) => (
            <section class="flex flex-col rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">{group.title}</h2>
              <p class="mt-1 flex-1 text-xs leading-relaxed text-text-secondary">{group.description}</p>
              <ul class="mt-3 space-y-2 border-t border-stroke pt-3">
                <For each={group.articleIds}>
                  {(id) => {
                    const article = props.articlesById.get(id);
                    return (
                      <Show when={article}>
                        {(a) => (
                          <li>
                            <button
                              type="button"
                              class="w-full rounded-md px-1 py-1 text-left hover:bg-brand-50"
                              onClick={() => props.onSelect(a().id)}
                            >
                              <span class="text-sm font-medium text-brand-600 hover:underline">{a().title}</span>
                              <p class="mt-0.5 text-xs text-text-secondary">{a().scenario}</p>
                            </button>
                          </li>
                        )}
                      </Show>
                    );
                  }}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </div>
  );
}
