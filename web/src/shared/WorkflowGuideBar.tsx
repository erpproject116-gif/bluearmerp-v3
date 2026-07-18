import { A, useLocation } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { resolveWorkflowForPath } from "./workflowGuides";

function expandedKey(guideId: string): string {
  return `workflow-guide-expanded:${guideId}`;
}

function readExpanded(guideId: string): boolean {
  try {
    return localStorage.getItem(expandedKey(guideId)) === "1";
  } catch {
    return false;
  }
}

function writeExpanded(guideId: string, value: boolean) {
  try {
    localStorage.setItem(expandedKey(guideId), value ? "1" : "0");
  } catch {
    /* private mode — non-fatal */
  }
}

/**
 * Plain-language "where am I in this workflow" strip shown at the top of
 * pages that belong to a start-to-finish business flow (selling, buying,
 * serial tracking). Collapsed it is a single line; expanded it walks the
 * user through every step with what to do and where to click.
 */
export function WorkflowGuideBar() {
  const loc = useLocation();
  const resolved = createMemo(() => resolveWorkflowForPath(loc.pathname));

  // Store per-guide expansion so a user who hides the selling guide still
  // sees the buying guide expanded the first time they meet it.
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({});
  const isExpanded = (guideId: string) => {
    const m = expandedMap();
    if (guideId in m) return m[guideId];
    return readExpanded(guideId);
  };
  const toggleExpanded = (guideId: string) => {
    const next = !isExpanded(guideId);
    setExpandedMap((m) => ({ ...m, [guideId]: next }));
    writeExpanded(guideId, next);
  };

  return (
    <Show when={resolved()}>
      {(r) => {
        const guide = () => r().guide;
        const stepIndex = () => r().stepIndex;
        return (
          <section
            class="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 shadow-sm"
            aria-label={`Workflow guide: ${guide().title}`}
          >
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div class="flex min-w-0 items-center gap-2">
                <span class="rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Guide
                </span>
                <p class="truncate text-sm font-medium text-text-primary">{guide().title}</p>
              </div>

              <div class="flex flex-wrap items-center gap-1 text-xs" aria-label="Workflow steps">
                <For each={guide().steps}>
                  {(step, i) => (
                    <>
                      <Show when={i() > 0}>
                        <span class="text-text-secondary/60" aria-hidden="true">
                          →
                        </span>
                      </Show>
                      <A
                        href={step.href}
                        class="rounded-md px-1.5 py-0.5 font-medium transition-colors"
                        classList={{
                          "bg-brand-600 text-white": i() === stepIndex(),
                          "bg-white text-text-secondary shadow-sm hover:text-brand-700": i() !== stepIndex(),
                        }}
                        aria-current={i() === stepIndex() ? "step" : undefined}
                        title={step.optional ? `${step.title} (optional)` : step.title}
                      >
                        {i() + 1}. {step.short}
                        <Show when={step.optional}>
                          <span class="ml-1 opacity-70">(optional)</span>
                        </Show>
                      </A>
                    </>
                  )}
                </For>
              </div>

              <div class="ml-auto flex items-center gap-2">
                <span class="hidden text-xs text-text-secondary sm:inline">
                  You are on step {stepIndex() + 1} of {guide().steps.length}
                </span>
                <button
                  type="button"
                  class="rounded-md border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
                  aria-expanded={isExpanded(guide().id)}
                  onClick={() => toggleExpanded(guide().id)}
                >
                  {isExpanded(guide().id) ? "Hide steps" : "Show me how"}
                </button>
              </div>
            </div>

            <Show when={isExpanded(guide().id)}>
              <div class="border-t border-brand-100 px-4 py-3">
                <p class="max-w-3xl text-sm leading-relaxed text-text-secondary">{guide().summary}</p>
                <ol class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <For each={guide().steps}>
                    {(step, i) => (
                      <li
                        class="rounded-lg border bg-white px-3 py-2.5"
                        classList={{
                          "border-brand-400 ring-1 ring-brand-200": i() === stepIndex(),
                          "border-stroke": i() !== stepIndex(),
                        }}
                      >
                        <div class="flex items-start gap-2.5">
                          <span
                            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                            classList={{
                              "bg-brand-600 text-white": i() === stepIndex(),
                              "bg-slate-100 text-text-secondary": i() !== stepIndex(),
                            }}
                            aria-hidden="true"
                          >
                            {i() + 1}
                          </span>
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                              <p class="text-sm font-medium text-text-primary">{step.title}</p>
                              <Show when={step.optional}>
                                <span class="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                  Optional
                                </span>
                              </Show>
                            </div>
                            <p class="mt-1 text-xs leading-relaxed text-text-secondary">{step.what}</p>
                            <Show
                              when={i() !== stepIndex()}
                              fallback={
                                <p class="mt-1.5 text-xs font-medium text-brand-700">You are here</p>
                              }
                            >
                              <A
                                href={step.href}
                                class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                              >
                                Open this page
                                <span aria-hidden="true">→</span>
                              </A>
                            </Show>
                          </div>
                        </div>
                      </li>
                    )}
                  </For>
                </ol>
                <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                  <Show when={guide().docHref}>
                    <A href={guide().docHref!} class="font-medium text-brand-600 hover:underline">
                      Read the full step-by-step guide
                    </A>
                  </Show>
                  <span>
                    Stuck? Click the round <span class="font-semibold">?</span> help button (bottom right) and ask in
                    your own words.
                  </span>
                </div>
              </div>
            </Show>
          </section>
        );
      }}
    </Show>
  );
}
