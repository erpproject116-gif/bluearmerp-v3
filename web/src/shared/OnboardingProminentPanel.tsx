import { A, useLocation } from "@solidjs/router";
import { For, Show, createEffect, createSignal } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";
import { useOnboarding, useSetupReadiness } from "./usePlatform";
import { canManageWorkspaceSetup } from "./resolveAppEntryPath";
import { resolvePrimaryNudge } from "./resolvePrimaryNudge";
import { GETTING_STARTED_COPY, resolveGettingStarted } from "./setupProgress";

const MINIMIZED_KEY = "erp.onboardingPanel.minimized";

const STEP_HINTS: Record<string, string> = Object.fromEntries(
  Object.entries(GETTING_STARTED_COPY).map(([id, c]) => [id, c.blurb]),
);

function storageKey(userId: number, tenantId: number) {
  return `${MINIMIZED_KEY}:${tenantId}:${userId}`;
}

function loadMinimized(userId: number, tenantId: number): boolean {
  try {
    return localStorage.getItem(storageKey(userId, tenantId)) === "1";
  } catch {
    return false;
  }
}

function saveMinimized(userId: number, tenantId: number, minimized: boolean) {
  try {
    localStorage.setItem(storageKey(userId, tenantId), minimized ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function OnboardingProminentPanel() {
  const loc = useLocation();
  const auth = useAuth();
  const qc = useQueryClient();
  const onboarding = useOnboarding();
  const setup = useSetupReadiness();
  const [minimized, setMinimized] = createSignal(false);
  const [hydrated, setHydrated] = createSignal(false);

  const me = () => auth.me;
  const canManage = () => canManageWorkspaceSetup(me());
  const onOnboardingRoute = () =>
    loc.pathname.startsWith("/app/setup") || loc.pathname.startsWith("/app/onboarding");

  const showSetupChecklist = () => onboarding.data?.show_setup_checklist ?? false;
  const showPlaybook = () => onboarding.data?.show_playbook ?? false;
  const foundationIncomplete = () => setup.data && !setup.data.required_complete;

  const visible = () => {
    if (!me() || !loc.pathname.startsWith("/app") || onOnboardingRoute()) return false;
    const nudge = resolvePrimaryNudge({
      me: me(),
      setup: setup.data,
      onboarding: onboarding.data,
      pathname: loc.pathname,
    });
    if (nudge === "playbook") return true;
    if (nudge === "setup" && showSetupChecklist() && canManage()) {
      if (loc.pathname.startsWith("/app/dashboard")) return false;
      return true;
    }
    return false;
  };

  const gettingStarted = () => resolveGettingStarted(setup.data);

  const percent = () => {
    if (showPlaybook() && !showSetupChecklist()) return onboarding.data?.overall_percent ?? 0;
    if (gettingStarted().visible) return gettingStarted().percent;
    return setup.data?.percent ?? onboarding.data?.percent ?? 0;
  };

  const nextHref = () => {
    if (gettingStarted().visible) {
      return "/app/dashboard/getting-started";
    }
    if (showSetupChecklist() || foundationIncomplete()) {
      return setup.data?.next_step?.href ?? onboarding.data?.next_step?.href ?? "/app/setup";
    }
    const commercial = auth.me?.commercial?.status;
    if (commercial && commercial !== "unlocked" && !auth.me?.tenant?.is_demo) {
      return "/app/inventory";
    }
    return onboarding.data?.next_extended_step?.href ?? "/app/onboarding";
  };

  const nextLabel = () => {
    if (gettingStarted().visible) {
      return gettingStarted().next?.label ?? "Continue setup";
    }
    if (showSetupChecklist() || foundationIncomplete()) {
      return setup.data?.next_step?.label ?? onboarding.data?.next_step?.label ?? "Continue setup";
    }
    const commercial = auth.me?.commercial?.status;
    if (commercial === "awaiting_payment") return "Complete Day 1 payment";
    if (commercial && commercial !== "unlocked" && !auth.me?.tenant?.is_demo) {
      return "Day 1: Stocks setup";
    }
    const ext = onboarding.data?.next_extended_step;
    if (ext) return `${ext.track_title}: ${ext.label}`;
    return "Open playbook";
  };

  const nextHint = () => {
    if (gettingStarted().visible && gettingStarted().next) {
      return gettingStarted().next!.blurb;
    }
    const stepId = setup.data?.next_step?.id ?? onboarding.data?.next_step?.id;
    if (stepId && STEP_HINTS[stepId]) return STEP_HINTS[stepId];
    if (showPlaybook()) {
      return "Work through selling, buying, POS, and finance at your own pace.";
    }
    return "Finish foundation setup so purchases, POS, and accounting work smoothly.";
  };

  const title = () => {
    const company = me()?.tenant.company_name?.trim();
    if (onboarding.data?.is_new_user && foundationIncomplete()) {
      return company ? `Welcome — set up ${company}` : "Welcome — let's set up your workspace";
    }
    if (showPlaybook() && !showSetupChecklist()) {
      return company ? `Team guide for ${company}` : "Onboarding playbook";
    }
    if (!canManage()) {
      return company ? `${company} — setup in progress` : "Workspace setup in progress";
    }
    return company ? `Finish setup for ${company}` : "Finish workspace setup";
  };

  const setupSteps = () => {
    const gs = gettingStarted().steps.filter((s) => !s.done || s.required).slice(0, 6);
    if (gs.length > 0) return gs.map((s) => ({ id: s.id, label: s.label, done: s.done }));
    const steps = onboarding.data?.steps ?? setup.data?.steps ?? [];
    return steps.filter((s) => s.required !== false).slice(0, 4);
  };

  createEffect(() => {
    const m = me();
    if (!m) return;
    const isNew = onboarding.data?.is_new_user;
    const stored = loadMinimized(m.user.id, m.tenant.id);
    setMinimized(isNew ? false : stored);
    setHydrated(true);
  });

  const minimize = () => {
    const m = me();
    if (!m) return;
    setMinimized(true);
    saveMinimized(m.user.id, m.tenant.id, true);
  };

  const expand = () => {
    const m = me();
    if (!m) return;
    setMinimized(false);
    saveMinimized(m.user.id, m.tenant.id, false);
  };

  const snooze = async () => {
    if (foundationIncomplete() && canManage()) {
      await apiFetch("/api/v1/platform/setup-readiness/snooze", { method: "POST" }, { silent: true });
    } else if (showPlaybook()) {
      await apiFetch(
        "/api/v1/platform/onboarding/dismiss",
        { method: "POST", body: JSON.stringify({ snooze_only: true }) },
        { silent: true },
      );
    }
    await qc.invalidateQueries({ queryKey: ["setup-readiness"] });
    await qc.invalidateQueries({ queryKey: ["onboarding"] });
    minimize();
  };

  return (
    <Show when={visible() && hydrated()}>
      <div
        class="pointer-events-none fixed bottom-5 left-5 z-40 max-w-[calc(100vw-2.5rem)]"
        aria-live="polite"
      >
        <Show
          when={!minimized()}
          fallback={
            <button
              type="button"
              class="pointer-events-auto flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-800 shadow-lg ring-2 ring-brand-100 transition hover:bg-brand-50"
              onClick={expand}
              aria-label="Expand onboarding guide"
            >
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {percent()}%
              </span>
              <span class="hidden sm:inline">{title()}</span>
              <span class="sm:hidden">Setup</span>
            </button>
          }
        >
          <div class="pointer-events-auto w-[min(100vw-2.5rem,22rem)] overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-2xl ring-1 ring-brand-100">
            <div class="bg-gradient-to-br from-brand-600 to-brand-700 px-4 py-3 text-white">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-medium uppercase tracking-wide text-brand-100">Getting started</p>
                  <h2 class="mt-0.5 text-base font-semibold leading-snug">{title()}</h2>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-md p-1 text-brand-100 hover:bg-white/15 hover:text-white"
                  title="Minimize"
                  aria-label="Minimize onboarding guide"
                  onClick={minimize}
                >
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" d="M5 12h14" />
                  </svg>
                </button>
              </div>
              <div class="mt-3">
                <div class="mb-1 flex items-center justify-between text-xs text-brand-100">
                  <span>Progress</span>
                  <span class="font-semibold text-white">{percent()}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-brand-800/40">
                  <div
                    class="h-full rounded-full bg-white transition-all duration-300"
                    style={{ width: `${percent()}%` }}
                  />
                </div>
              </div>
            </div>

            <div class="space-y-3 px-4 py-3">
              <p class="text-sm text-text-secondary">{nextHint()}</p>

              <Show when={canManage() && setupSteps().length > 0 && (showSetupChecklist() || foundationIncomplete())}>
                <ul class="space-y-1.5 rounded-lg bg-slate-50 p-2.5">
                  <For each={setupSteps()}>
                    {(step) => (
                      <li class="flex items-center gap-2 text-xs">
                        <span
                          class={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                            step.done ? "bg-emerald-100 text-emerald-700" : "bg-white text-text-secondary ring-1 ring-stroke"
                          }`}
                        >
                          {step.done ? "✓" : ""}
                        </span>
                        <span classList={{ "text-text-secondary line-through": step.done, "font-medium text-text-primary": !step.done }}>
                          {step.label}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <Show when={!canManage()}>
                <p class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
                  Your administrator is finishing the initial configuration. You can explore the app, but some
                  documents may be blocked until setup is done.
                </p>
              </Show>

              <div class="flex flex-wrap gap-2 pt-1">
                <Show
                  when={canManage()}
                  fallback={
                    <A
                      href="/app/dashboard"
                      class="inline-flex flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Go to dashboard
                    </A>
                  }
                >
                  <A
                    href={nextHref()}
                    class="inline-flex flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    {nextLabel()}
                  </A>
                </Show>
                <Show when={showPlaybook()}>
                  <A
                    href="/app/onboarding"
                    class="inline-flex items-center justify-center rounded-lg border border-stroke px-3 py-2 text-xs font-medium text-text-primary hover:bg-slate-50"
                  >
                    Full playbook
                  </A>
                </Show>
              </div>

              <Show when={canManage()}>
                <button
                  type="button"
                  class="w-full text-center text-xs text-text-secondary hover:text-brand-600"
                  onClick={() => void snooze()}
                >
                  Remind me later
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
