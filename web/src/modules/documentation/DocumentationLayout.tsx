import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { DocBlock } from "./documentationTypes";
import { ModuleIcon } from "../../shell/ModuleIcon";

function DocBlockView(props: { block: DocBlock }) {
  return (
    <Show
      when={props.block.type === "paragraph"}
      fallback={
        <Show
          when={props.block.type === "steps"}
          fallback={
            <Show
              when={props.block.type === "tip"}
              fallback={
                <Show when={props.block.type === "flow"}>
                  <div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-text-primary">
                    <For each={(props.block as Extract<DocBlock, { type: "flow" }>).items}>
                      {(step, i) => (
                        <>
                          <Show when={i() > 0}>
                            <span class="text-text-secondary" aria-hidden="true">
                              →
                            </span>
                          </Show>
                          <span class="font-medium">{step}</span>
                        </>
                      )}
                    </For>
                  </div>
                </Show>
              }
            >
              <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-text-primary">
                <span class="font-medium text-brand-700">Tip: </span>
                {(props.block as Extract<DocBlock, { type: "tip" }>).text}
              </div>
            </Show>
          }
        >
          <ol class="list-decimal space-y-2 pl-5 text-sm text-text-primary">
            <For each={(props.block as Extract<DocBlock, { type: "steps" }>).items}>
              {(step) => <li>{step}</li>}
            </For>
          </ol>
        </Show>
      }
    >
      <p class="text-sm leading-relaxed text-text-primary">{(props.block as Extract<DocBlock, { type: "paragraph" }>).text}</p>
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
};

export function DocumentationContent(props: ContentProps) {
  return (
    <article class="min-w-0 flex-1 rounded-xl border border-stroke bg-white p-6 shadow-sm">
      <Show when={props.adminNote}>
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.adminNote}</p>
      </Show>
      <h2 class="text-xl font-semibold text-text-primary">{props.title}</h2>
      <p class="mt-2 text-sm text-text-secondary">{props.intro}</p>
      <div class="mt-6 space-y-4">
        <For each={props.blocks}>{(block) => <DocBlockView block={block} />}</For>
      </div>
      <Show when={props.primaryHref}>
        <div class="mt-8 border-t border-stroke pt-6">
          <A
            href={props.primaryHref!}
            class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {props.primaryLabel ?? "Open this area"}
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </A>
        </div>
      </Show>
    </article>
  );
}

type NavProps = {
  sections: { id: string; title: string; iconId: string }[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function DocumentationNav(props: NavProps) {
  return (
    <nav class="w-56 shrink-0" aria-label="Help topics">
      <p class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Topics</p>
      <ul class="space-y-0.5">
        <For each={props.sections}>
          {(section) => (
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": props.activeId === section.id,
                  "text-text-secondary hover:erp-panel hover:text-text-primary": props.activeId !== section.id,
                }}
                onClick={() => props.onSelect(section.id)}
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  classList={{
                    "bg-brand-100 text-brand-600": props.activeId === section.id,
                    "erp-panel text-text-secondary": props.activeId !== section.id,
                  }}
                >
                  <ModuleIcon id={section.iconId} class="h-4 w-4" />
                </span>
                <span class="truncate">{section.title}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </nav>
  );
}
