import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { useLocation } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";
import { useOnboarding, useSetupReadiness } from "./usePlatform";
import { resolvePrimaryNudge } from "./resolvePrimaryNudge";

export function SetupReminderBar() {
  const auth = useAuth();
  const loc = useLocation();
  const q = useSetupReadiness();
  const onboarding = useOnboarding();
  const qc = useQueryClient();
  const data = () => q.data;

  const nudge = () =>
    resolvePrimaryNudge({
      me: auth.me,
      setup: data(),
      onboarding: onboarding.data,
      pathname: loc.pathname,
    });

  const canManage = () =>
    auth.me?.user?.is_tenant_owner ||
    auth.me?.user?.is_store_admin ||
    auth.me?.user?.is_platform_superadmin;

  const snooze = async () => {
    await apiFetch("/api/v1/platform/setup-readiness/snooze", { method: "POST" }, { silent: true });
    await qc.invalidateQueries({ queryKey: ["setup-readiness"] });
    await qc.invalidateQueries({ queryKey: ["onboarding"] });
  };

  return (
    <>
      <Show when={nudge() === "setup" && data()?.show_setup_banner}>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          <div class="min-w-0">
            <p class="font-medium">Workspace setup incomplete ({data()!.percent}%)</p>
            <p class="text-xs text-amber-900/80">
              {data()!.next_step?.id === "chart_of_accounts"
                ? "Important: configure your chart of accounts (all four account types + Purchases/COGS mapping) so sales/POS posting and purchases can post correctly. Sales orders can still be saved."
                : data()!.next_step
                  ? `Next: ${data()!.next_step!.label}. Sales documents can be saved; finish setup for purchases, POS, and auto-posting.`
                  : "Finish foundation setup for purchases, POS, and accounting auto-posting."}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <A
              href="/app/dashboard/getting-started"
              class="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
            >
              Continue setup
            </A>
            <button
              type="button"
              class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              onClick={() => void snooze()}
            >
              Remind me later
            </button>
          </div>
        </div>
      </Show>

      <Show when={nudge() === "commercial"}>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-slate-800">
          <div class="min-w-0">
            <p class="font-medium">
              {auth.me?.commercial?.status === "awaiting_payment"
                ? "Day 1 payment pending"
                : "Finish Day 1 to unlock trading"}
            </p>
            <p class="text-xs text-slate-600">
              {auth.me?.commercial?.status === "awaiting_payment"
                ? "Pay via GCash and wait for Bluearm to confirm before buying or selling."
                : "Open Stocks — add places, products, and opening stock."}
            </p>
          </div>
          <A
            href="/app/inventory"
            class="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Open Stocks Day 1
          </A>
        </div>
      </Show>

      <Show when={nudge() === "setup" && !canManage() && data() && !data()!.required_complete}>
        <div class="mt-3 rounded-lg border border-stroke bg-slate-50 px-4 py-2 text-xs text-text-secondary">
          Workspace setup is still in progress. Your administrator is finishing the initial configuration.
        </div>
      </Show>
    </>
  );
}

export function SetupBreadcrumbHint() {
  const q = useSetupReadiness();
  const onboarding = useOnboarding();
  const auth = useAuth();
  const loc = useLocation();
  const data = () => q.data;

  const nudge = () =>
    resolvePrimaryNudge({
      me: auth.me,
      setup: data(),
      onboarding: onboarding.data,
      pathname: loc.pathname,
    });

  return (
    <Show when={nudge() === "setup" && data()?.show_breadcrumb_hint}>
      <>
        <span class="text-amber-700">
          Setup incomplete ({data()!.percent}%) ·{" "}
          <A
            href={data()!.next_step?.href ?? "/app/setup"}
            class="font-medium underline hover:text-amber-900"
          >
            Resume setup
          </A>
        </span>
        <span class="mx-1.5 text-text-secondary/50" aria-hidden="true">
          |
        </span>
      </>
    </Show>
  );
}
