import { A, useLocation } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { resolveWorkflowForPath, type ResolvedWorkflow } from "./workflowGuides";
import { useOnboarding } from "./usePlatform";
import { useAuth } from "./auth-context";
import { Modal } from "./Modal";

function seenKey(guideId: string): string {
  return `workflow-guide-seen:${guideId}`;
}

function readSeen(guideId: string): boolean {
  try {
    return localStorage.getItem(seenKey(guideId)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(guideId: string) {
  try {
    localStorage.setItem(seenKey(guideId), "1");
  } catch {
    /* private mode — non-fatal */
  }
}

function usePreferGuideBadge() {
  const onboarding = useOnboarding();
  return createMemo(() => {
    const d = onboarding.data;
    if (!d) return true;
    if (d.show_setup_checklist) return true;
    if (d.show_playbook && (d.overall_percent ?? 0) < 80) return true;
    return false;
  });
}

function GuideBookIcon() {
  return (
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

type ModalBodyProps = {
  resolved: ResolvedWorkflow;
  onClose: () => void;
};

function WorkflowGuideModalBody(props: ModalBodyProps) {
  const guide = () => props.resolved.guide;
  const stepIndex = () => props.resolved.stepIndex;

  return (
    <div>
      <p class="max-w-3xl text-sm leading-relaxed text-text-secondary">{guide().summary}</p>
      <p class="mt-2 text-xs text-text-secondary">
        You are on step {stepIndex() + 1} of {guide().steps.length}
      </p>
      <ol class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <For each={guide().steps}>
          {(step, i) => (
            <li
              class="rounded-lg border bg-surface px-3 py-2.5"
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
                    "bg-panel-strong text-text-secondary": i() !== stepIndex(),
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
                    fallback={<p class="mt-1.5 text-xs font-medium text-brand-700">You are here</p>}
                  >
                    <A
                      href={step.href}
                      class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => props.onClose()}
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
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <Show when={guide().docHref}>
          <A href={guide().docHref!} class="font-medium text-brand-600 hover:underline" onClick={() => props.onClose()}>
            Read the full step-by-step guide
          </A>
        </Show>
        <span>
          Stuck? Click the round <span class="font-semibold">?</span> help button (bottom right) and ask in your own
          words.
        </span>
      </div>
    </div>
  );
}

/**
 * Compact Guide control for AppShell header (and POS Terminal chrome).
 * Opens a modal with the path-resolved workflow — never auto-opens.
 */
export function WorkflowGuideHeaderControl(props?: { class?: string; compact?: boolean }) {
  const loc = useLocation();
  const auth = useAuth();
  const preferBadge = usePreferGuideBadge();
  const [open, setOpen] = createSignal(false);
  const [seenMap, setSeenMap] = createSignal<Record<string, boolean>>({});

  const resolved = createMemo(() => resolveWorkflowForPath(loc.pathname, auth.me));

  const isSeen = (guideId: string) => {
    const m = seenMap();
    if (guideId in m) return m[guideId]!;
    return readSeen(guideId);
  };

  const showBadge = () => {
    const r = resolved();
    if (!r || !preferBadge()) return false;
    return !isSeen(r.guide.id);
  };

  const openGuide = () => {
    const r = resolved();
    if (!r) return;
    writeSeen(r.guide.id);
    setSeenMap((m) => ({ ...m, [r.guide.id]: true }));
    setOpen(true);
  };

  const closeGuide = () => setOpen(false);

  // Close when navigating away from any matching workflow.
  createEffect(() => {
    const r = resolved();
    if (!r && open()) setOpen(false);
  });

  return (
    <Show when={resolved()}>
      {(r) => (
        <>
          <button
            type="button"
            classList={{
              "erp-guide-pulse": showBadge(),
            }}
            class={
              props?.class ??
              "relative inline-flex items-center gap-1.5 rounded-lg border border-stroke px-2.5 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            }
            aria-haspopup="dialog"
            aria-expanded={open()}
            title={r().guide.title}
            onClick={openGuide}
          >
            <GuideBookIcon />
            <span>Guide</span>
            <Show when={!props?.compact}>
              <span class="hidden text-text-secondary sm:inline">
                · Step {r().stepIndex + 1}/{r().guide.steps.length}
              </span>
            </Show>
            <Show when={showBadge()}>
              <span
                class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-surface"
                aria-label="New guide tip"
              />
            </Show>
          </button>
          <Modal open={open()} title={r().guide.title} onClose={closeGuide} wide icon={<GuideBookIcon />}>
            <WorkflowGuideModalBody
              resolved={{
                guide: r().guide,
                stepIndex: r().stepIndex,
                visibleSteps: r().visibleSteps,
              }}
              onClose={closeGuide}
            />
          </Modal>
        </>
      )}
    </Show>
  );
}

/** @deprecated Use WorkflowGuideHeaderControl */
export const WorkflowGuideBar = WorkflowGuideHeaderControl;
