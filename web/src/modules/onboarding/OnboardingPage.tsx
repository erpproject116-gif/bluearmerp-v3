import { A, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { OnboardingTrackPanel } from "../../shared/OnboardingChecklist";
import { apiFetch } from "../../shared/api";
import { useOnboarding } from "../../shared/usePlatform";

const PLAYBOOK_WEEKS = [
  {
    title: "Week 1 — Foundation & admin",
    body: "Complete workspace setup, review process policies (including attachment rules), enable modules, and invite your team. Importing from another system is optional — skip Migration Center if you will enter data in Bluearm.",
    tracks: ["foundation", "admin"],
  },
  {
    title: "Week 2 — Selling & stock",
    body: "Quotation → sales order (Load Slip) → pick list → invoice (Load Slip) → customer payment. Check pre-invoicing and stock reconciliation.",
    tracks: ["selling", "serials", "insights"],
  },
  {
    title: "Week 3 — Buying & accounts",
    body: "PR → RFQ → PO → goods receipt → supplier invoice (Load Slip) → payment. Review purchase pre-invoicing and Customer/Vendor Book.",
    tracks: ["buying", "finance"],
  },
  {
    title: "Week 4 — POS & operations",
    body: "Configure POS Manage, open a shift, checkout (with serial scan if needed), and close the shift. Explore CRM, after-sales, and support.",
    tracks: ["pos", "operations"],
  },
];

const KB_QUICK_LINKS: { label: string; articleId: string }[] = [
  { label: "What is Load Slip?", articleId: "load-slip-overview" },
  { label: "Attachment before Confirm", articleId: "attachment-requirements" },
  { label: "Quote to cash", articleId: "quotation-to-sales-flow" },
  { label: "Buy to pay", articleId: "purchase-request-to-ap-flow" },
  { label: "RFQ and vendor quotes", articleId: "rfq-workflow" },
  { label: "Pre-invoicing (sales)", articleId: "sales-pre-invoicing-report" },
  { label: "Pre-invoicing (purchases)", articleId: "purchase-pre-invoicing-report" },
  { label: "Customer/Vendor Book", articleId: "customer-vendor-book-report" },
];

export default function OnboardingPage() {
  const q = useOnboarding();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const data = () => q.data;
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
            for module reference, or{" "}
            <A href="/app/documentation/kb" class="text-brand-600 hover:underline">
              Knowledge base
            </A>{" "}
            for step-by-step scenarios.
          </p>
          <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Common questions</p>
          <ul class="mt-2 grid gap-1 sm:grid-cols-2">
            <For each={KB_QUICK_LINKS}>
              {(link) => (
                <li>
                  <A href={`/app/documentation/kb/${link.articleId}`} class="text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={showPlaybook()}>
        <div class="mt-8 flex flex-wrap gap-4">
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
    </div>
  );
}
