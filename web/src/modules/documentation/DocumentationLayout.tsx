import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { DocBlock, DocGroup, DocSection } from "./documentationTypes";
import { ModuleIcon } from "../../shell/ModuleIcon";
import { filterSections } from "./documentationSearch";

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
  prev?: { id: string; title: string };
  next?: { id: string; title: string };
  onNavigate: (id: string) => void;
};

export function DocumentationContent(props: ContentProps) {
  return (
    <article class="min-w-0 flex-1">
      <Show when={props.adminNote}>
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.adminNote}</p>
      </Show>

      <header class="border-b border-stroke pb-5">
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

export function DocumentationHome(props: HomeProps) {
  return (
    <div class="space-y-8">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Help &amp; guides</h1>
        <p class="mt-2 text-sm leading-relaxed text-text-secondary">
          Plain-language instructions grouped by what you are trying to do. Pick a category below, or use the sidebar search when
          reading a topic.
        </p>
      </header>

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
