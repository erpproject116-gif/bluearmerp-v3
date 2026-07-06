import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";
import { useSetupReadiness } from "./usePlatform";

export function SetupReminderBar() {
  const auth = useAuth();
  const q = useSetupReadiness();
  const qc = useQueryClient();
  const data = () => q.data;

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
      <Show when={data()?.show_setup_banner}>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          <div class="min-w-0">
            <p class="font-medium">Workspace setup incomplete ({data()!.percent}%)</p>
            <p class="text-xs text-amber-900/80">
              {data()!.next_step
                ? `Next: ${data()!.next_step!.label}`
                : "Finish foundation setup before creating transactions."}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <A
              href={data()!.next_step?.href ?? "/app/setup"}
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

      <Show when={!canManage() && data() && !data()!.required_complete}>
        <div class="mt-3 rounded-lg border border-stroke bg-slate-50 px-4 py-2 text-xs text-text-secondary">
          Workspace setup is still in progress. Your administrator is finishing the initial configuration.
        </div>
      </Show>
    </>
  );
}

export function SetupBreadcrumbHint() {
  const q = useSetupReadiness();
  const data = () => q.data;

  return (
    <Show when={data()?.show_breadcrumb_hint}>
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
