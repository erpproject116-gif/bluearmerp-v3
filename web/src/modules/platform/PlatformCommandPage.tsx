import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { usePlatformCommandOverview } from "../../shared/usePlatform";

export default function PlatformCommandPage() {
  const overview = usePlatformCommandOverview();
  const counts = () => overview.data?.counts;
  const queue = () => overview.data?.queue ?? [];

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-semibold">Operational queue</h2>
        <p class="mt-1 text-sm text-slate-500">
          Prioritized interventions — trials, inactive tenants, product gaps, and overdue follow-ups.
        </p>
      </div>

      <Show when={overview.isLoading}>
        <p class="text-sm text-slate-500">Loading overview…</p>
      </Show>
      <Show when={overview.isError}>
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {(overview.error as Error)?.message ?? "Failed to load overview."}
        </p>
      </Show>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Pending approvals" value={counts()?.pending_approvals} href="/app/platform-command/customers?tenant_status=pending_approval" accent />
        <Stat label="Open tickets" value={counts()?.open_tickets} href="/app/platform-command/tickets" />
        <Stat label="Churn risk" value={counts()?.churn_risk} href="/app/platform-command/customers" accent />
        <Stat label="Trials ending" value={counts()?.trial_ending} href="/app/platform-command/customers" />
        <Stat label="No docs (7d+)" value={counts()?.no_docs_trials} href="/app/platform-command/onboarding" />
        <Stat label="Inactive trials" value={counts()?.inactive_trials} href="/app/platform-command/onboarding" />
        <Stat label="Overdue follow-ups" value={counts()?.overdue_follow_ups} href="/app/platform-command/follow-ups" accent />
        <Stat label="Open follow-ups" value={counts()?.open_follow_ups} href="/app/platform-command/follow-ups" />
        <Stat label="Product gaps" value={counts()?.product_gap_tickets} href="/app/platform-command/tickets" />
        <Stat label="Pending invites" value={counts()?.pending_invites} href="/app/platform-command/access" />
      </div>

      <section class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-4 py-3">
          <h3 class="text-sm font-semibold">Needs attention</h3>
        </div>
        <ul class="divide-y divide-slate-100">
          <Show when={queue().length === 0}>
            <li class="px-4 py-6 text-sm text-slate-500">No open items in the queue.</li>
          </Show>
          <For each={queue()}>
            {(item) => {
              const href =
                item.href ||
                (item.customer_id
                  ? `/app/platform-command/customers/${item.customer_id}`
                  : "/app/platform-command");
              return (
                <li class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div class="min-w-0">
                    <p class="font-medium text-slate-800">{item.title}</p>
                    <p class="text-xs uppercase tracking-wide text-slate-400">
                      {item.kind.replace("_", " ")}
                      <Show when={item.severity}>
                        <span
                          class="ml-2 rounded px-1 py-0.5 normal-case"
                          classList={{
                            "bg-red-100 text-red-800": item.severity === "high",
                            "bg-amber-100 text-amber-900": item.severity === "medium",
                            "bg-slate-100 text-slate-600": item.severity === "low",
                          }}
                        >
                          {item.severity}
                        </span>
                      </Show>
                    </p>
                  </div>
                  <A
                    href={href}
                    class="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                  >
                    Open
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </section>
    </div>
  );
}

function Stat(props: { label: string; value?: number; href: string; accent?: boolean }) {
  return (
    <A
      href={props.href}
      class="rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300"
      classList={{ "border-amber-200 bg-amber-50/50": props.accent && (props.value ?? 0) > 0 }}
    >
      <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums">{props.value ?? "—"}</p>
    </A>
  );
}
