import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { OnboardingChecklist, OnboardingTrackPanel } from "../../shared/OnboardingChecklist";
import { apiFetch } from "../../shared/api";
import { useOnboarding } from "../../shared/usePlatform";

const PLAYBOOK_WEEKS = [
  {
    title: "Week 1 — Foundation & admin",
    body: "Complete workspace setup, review process policies, enable modules (POS, WMS, Quality), and invite your team.",
    tracks: ["foundation", "admin"],
  },
  {
    title: "Week 2 — Selling & stock",
    body: "Run quotation → sales order → pick list → invoice. If you track serials, complete the serial track. Check stock reconciliation on the dashboard.",
    tracks: ["selling", "serials", "insights"],
  },
  {
    title: "Week 3 — Buying & accounts",
    body: "Purchase request through goods receipt, supplier invoice, and payment voucher. Review trial balance and bank reconciliation.",
    tracks: ["buying", "finance"],
  },
  {
    title: "Week 4 — POS & operations",
    body: "Configure POS Manage, organize categories, open a shift, checkout (with serial scan if needed), and close the shift. Explore CRM, after-sales, and support.",
    tracks: ["pos", "operations"],
  },
];

export default function OnboardingPage() {
  const q = useOnboarding();
  const data = () => q.data;
  const tracks = () => data()?.tracks ?? [];
  const overall = () => data()?.overall_percent ?? 0;

  const dismiss = async () => {
    await apiFetch("/api/v1/platform/onboarding/dismiss", { method: "POST" }, { silent: true });
    window.location.href = "/app/dashboard";
  };

  const trackById = (id: string) => tracks().find((t) => t.id === id);

  return (
    <div class="mx-auto max-w-3xl p-6">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Onboarding playbook</p>
        <h1 class="mt-1 text-2xl font-semibold text-text-primary">Get the most from BluearmERP</h1>
        <p class="mt-2 text-sm text-text-secondary">
          A guided path through every module — selling, buying, stock, accounts, POS, CRM, and more.
          Steps auto-complete when you use the app; review steps can be marked done manually.
        </p>
      </div>

      <Show when={q.isLoading}>
        <p class="text-sm text-text-secondary">Loading playbook…</p>
      </Show>

      <Show when={data()}>
        <div class="mb-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="text-3xl font-bold text-text-primary">{overall()}%</p>
              <p class="text-sm text-text-secondary">Overall onboarding progress</p>
            </div>
            <Show when={!data()!.required_complete}>
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
        </div>

        <div class="mb-8 space-y-6">
          <For each={PLAYBOOK_WEEKS}>
            {(week) => (
              <div>
                <h2 class="text-sm font-semibold text-text-primary">{week.title}</h2>
                <p class="mt-1 text-xs text-text-secondary">{week.body}</p>
                <div class="mt-3 space-y-3">
                  <For each={week.tracks}>
                    {(tid) => {
                      const tr = () => trackById(tid);
                      return (
                        <Show when={tr()}>
                          {(t) => (
                            <OnboardingTrackPanel
                              track={t()}
                              defaultOpen={t().percent < 100 && t().percent > 0}
                            />
                          )}
                        </Show>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="mb-8">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">All tracks</h2>
          <div class="space-y-3">
            <For each={tracks()}>
              {(track, i) => (
                <OnboardingTrackPanel track={track} defaultOpen={i() === 0 && track.percent < 100} />
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-stroke bg-slate-50 p-5 text-sm text-text-secondary">
          <p class="font-medium text-text-primary">Need more detail?</p>
          <p class="mt-2">
            Open{" "}
            <A href="/app/documentation" class="text-brand-600 hover:underline">
              Help & guides
            </A>{" "}
            for module reference docs, or{" "}
            <A href="/app/documentation/kb" class="text-brand-600 hover:underline">
              Knowledge base
            </A>{" "}
            for step-by-step scenarios including POS checkout and serial scanning.
          </p>
        </div>

        <div class="mt-6">
          <OnboardingChecklist />
        </div>
      </Show>

      <button
        type="button"
        class="mt-8 text-xs text-text-secondary hover:underline"
        onClick={() => void dismiss()}
      >
        Remind me later
      </button>
    </div>
  );
}
