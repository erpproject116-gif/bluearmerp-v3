import { A, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { OnboardingTrackPanel } from "../../shared/OnboardingChecklist";
import { apiFetch } from "../../shared/api";
import { canManageWorkspaceSetup } from "../../shared/resolveAppEntryPath";
import { resolveGettingStarted } from "../../shared/setupProgress";
import { useAuth } from "../../shared/auth-context";
import { useOnboarding, useSetupReadiness } from "../../shared/usePlatform";
import {
  ONBOARDING_KB_QUICK_LINKS,
  ONBOARDING_PLAYBOOK_WEEKS,
  resolvePlaybookWeek,
} from "./onboardingPlaybookData";

/** Home → Onboarding: foundation checklist + full ERP/POS playbook (merged from /app/onboarding). */
export function HomeOnboarding() {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const setup = useSetupReadiness();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const canManage = () => canManageWorkspaceSetup(auth.me);
  const progress = () => resolveGettingStarted(setup.data);
  const data = () => onboarding.data;
  const tracks = () => data()?.tracks ?? [];
  const overall = () => data()?.overall_percent ?? 0;
  const showPlaybook = () => data()?.show_playbook ?? false;

  const dismiss = async (snoozeOnly: boolean) => {
    await apiFetch(
      "/api/v1/platform/onboarding/dismiss",
      { method: "POST", body: JSON.stringify({ snooze_only: snoozeOnly }) },
      { silent: true },
    );
    await qc.invalidateQueries({ queryKey: ["onboarding"] });
    navigate("/app/dashboard");
  };

  return (
    <div class="mx-auto max-w-3xl space-y-8">
      <header>
        <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Onboarding</p>
        <h2 class="mt-1 text-xl font-semibold text-text-primary">Set up your workspace and learn the modules</h2>
        <p class="mt-2 text-sm text-text-secondary">
          Finish foundation setup first, then work through the playbook at your own pace. Steps auto-complete when you
          use the app.
        </p>
      </header>

      <Show when={canManage() && progress().visible}>
        <section class="rounded-xl border border-brand-200 bg-brand-50/40 p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Foundation setup</p>
              <h3 class="text-base font-semibold text-text-primary">Company, products, first sale, and bank</h3>
              <p class="mt-1 text-sm text-text-secondary">Required before purchases, POS, and auto-posting work smoothly.</p>
            </div>
            <A
              href={progress().next?.href ?? "/app/setup"}
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Continue
            </A>
          </div>
          <div class="mb-3">
            <div class="mb-1 flex items-center justify-between text-xs text-text-secondary">
              <span>Progress</span>
              <span class="font-semibold text-text-primary">{progress().percent}%</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-brand-100">
              <div class="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress().percent}%` }} />
            </div>
          </div>
          <ul class="grid gap-2 sm:grid-cols-2">
            <For each={progress().steps}>
              {(step) => (
                <li>
                  <A
                    href={step.href}
                    class="flex items-start gap-2 rounded-lg border border-stroke/80 bg-white px-3 py-2.5 text-sm hover:border-brand-300"
                  >
                    <span
                      class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                        step.done
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-white text-text-secondary ring-1 ring-stroke"
                      }`}
                    >
                      {step.done ? "✓" : ""}
                    </span>
                    <span class="min-w-0">
                      <span
                        class="block font-medium"
                        classList={{
                          "text-text-secondary line-through": step.done,
                          "text-text-primary": !step.done,
                        }}
                      >
                        {step.label}
                        <Show when={!step.required}>
                          <span class="ml-1 text-xs font-normal text-text-secondary">Optional</span>
                        </Show>
                      </span>
                      <span class="mt-0.5 block text-xs text-text-secondary">{step.blurb}</span>
                    </span>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={!canManage() && setup.data && !setup.data.required_complete}>
        <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
          <h3 class="text-base font-semibold text-text-primary">Your team workspace is being set up</h3>
          <p class="mt-2 text-sm text-text-secondary">
            An administrator is finishing the initial configuration. You can explore the Dashboard tab; some documents may
            stay read-only until setup is complete.
          </p>
          <A href="/app/dashboard" class="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to Dashboard →
          </A>
        </section>
      </Show>

      <Show when={onboarding.isLoading}>
        <p class="text-sm text-text-secondary">Loading playbook…</p>
      </Show>

      <Show when={data()}>
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="text-3xl font-bold text-text-primary">{overall()}%</p>
              <p class="text-sm text-text-secondary">Overall onboarding progress</p>
            </div>
            <Show when={!data()!.required_complete && canManage()}>
              <A
                href="/app/setup"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Continue required setup
              </A>
            </Show>
          </div>
          <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${overall()}%` }} />
          </div>
        </section>

        <div class="space-y-6">
          <For each={ONBOARDING_PLAYBOOK_WEEKS}>
            {(week) => {
              const steps = () => resolvePlaybookWeek(week, tracks(), setup.data);
              return (
                <Show when={steps().length > 0}>
                  <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                    <h3 class="text-sm font-semibold text-text-primary">{week.title}</h3>
                    <p class="mt-1 text-xs text-text-secondary">{week.summary}</p>
                    <ul class="mt-4 space-y-3">
                      <For each={steps()}>
                        {(step) => (
                          <li class="flex flex-wrap items-start gap-3 rounded-lg border border-stroke/80 bg-slate-50/50 px-3 py-3">
                            <span
                              class={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                                step.done ? "bg-emerald-100 text-emerald-800" : "bg-white text-text-secondary ring-1 ring-stroke"
                              }`}
                              aria-hidden
                            >
                              {step.done ? "✓" : ""}
                            </span>
                            <div class="min-w-0 flex-1">
                              <p
                                class="text-sm leading-snug"
                                classList={{
                                  "text-text-secondary line-through": step.done,
                                  "text-text-primary": !step.done,
                                }}
                              >
                                {step.sentence}
                              </p>
                              <Show when={!step.done}>
                                <A
                                  href={step.href}
                                  class="mt-2 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                                >
                                  {step.cta}
                                </A>
                              </Show>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                </Show>
              );
            }}
          </For>
        </div>

        <section>
          <h3 class="mb-3 text-sm font-semibold text-text-primary">All tracks</h3>
          <div class="space-y-3">
            <For each={tracks()}>
              {(track, i) => (
                <OnboardingTrackPanel track={track} defaultOpen={i() === 0 && track.percent < 100} />
              )}
            </For>
          </div>
        </section>

        <section class="rounded-xl border border-stroke bg-slate-50 p-5 text-sm text-text-secondary">
          <p class="font-medium text-text-primary">Need more detail?</p>
          <p class="mt-2">
            Open{" "}
            <A href="/app/documentation" class="text-brand-600 hover:underline">
              Help &amp; guides
            </A>{" "}
            for module reference, or{" "}
            <A href="/app/documentation/kb" class="text-brand-600 hover:underline">
              Knowledge base
            </A>{" "}
            for step-by-step scenarios.
          </p>
          <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Common questions</p>
          <ul class="mt-2 grid gap-1 sm:grid-cols-2">
            <For each={ONBOARDING_KB_QUICK_LINKS}>
              {(link) => (
                <li>
                  <A href={`/app/documentation/kb/${link.articleId}`} class="text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </section>

        <Show when={showPlaybook() && canManage()}>
          <div class="flex flex-wrap gap-4">
            <button
              type="button"
              class="text-xs text-text-secondary hover:underline"
              onClick={() => void dismiss(true)}
            >
              Remind me later
            </button>
            <button
              type="button"
              class="text-xs text-text-secondary hover:underline"
              onClick={() => void dismiss(false)}
            >
              Don&apos;t show playbook again
            </button>
          </div>
        </Show>
      </Show>

      <Show when={canManage() && !progress().visible && !onboarding.isLoading && data()}>
        <section class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <h3 class="text-base font-semibold text-text-primary">Foundation setup complete</h3>
          <p class="mt-2 text-sm text-text-secondary">
            Required setup is done. Keep working through the playbook tracks above, or return to Dashboard for daily work.
          </p>
          <A href="/app/dashboard" class="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Dashboard →
          </A>
        </section>
      </Show>
    </div>
  );
}
