import { A, useNavigate } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
import { apiFetch } from "../../shared/api";
import { floorStatusLabel } from "./mfgRules";
import { newAssemblyOrderHref, newCuttingOrderHref, newRecipeOrderHref } from "./mfgProductionMode";

type DashboardKPI = {
  total_production_today: number;
  in_progress_orders: number;
  completed_today: number;
  material_shortage_items: number;
};

type RecentOrder = {
  id: number;
  work_order_no: string;
  bom_type: string;
  product_label: string;
  qty_to_produce: number;
  qty_produced: number;
  status: string;
  order_date: string;
  finished_unit_code?: string;
};

type Shortage = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
  work_order_id: number;
  work_order_no: string;
};

type Activity = {
  at: string;
  action: string;
  summary: string;
  ref_id?: number;
};

type Dashboard = {
  kpi: DashboardKPI;
  recent_orders: RecentOrder[];
  shortages: Shortage[];
  recent_activity: Activity[];
};

const TYPE_CARDS = [
  {
    id: "assembly",
    title: "Assembly",
    color: "border-blue-200 bg-blue-50 hover:border-blue-400",
    badge: "bg-blue-600",
    description: "Many components into one finished product.",
    example: "CPU + RAM + SSD → Desktop PC",
    href: newAssemblyOrderHref(),
  },
  {
    id: "cutting",
    title: "Cutting / Breakdown",
    color: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
    badge: "bg-emerald-600",
    description: "One raw material into multiple products.",
    example: "Whole Pork → Belly, Kasim, Ribs",
    href: newCuttingOrderHref(),
  },
  {
    id: "recipe",
    title: "Recipe / Processing",
    color: "border-orange-200 bg-orange-50 hover:border-orange-400",
    badge: "bg-orange-500",
    description: "Multiple ingredients into finished product(s).",
    example: "Pork + Spices → Tocino",
    href: newRecipeOrderHref(),
  },
] as const;

function typeLabel(bomType: string) {
  if (bomType === "disassembly") return "Cutting";
  if (bomType === "recipe") return "Recipe";
  return "Assembly";
}

function jobsHrefForOrder(o: RecentOrder) {
  if (o.bom_type === "disassembly") return `/app/production/disassembly/jobs`;
  if (o.bom_type === "recipe") return `/app/production/recipe/jobs`;
  return `/app/production/assembly/jobs`;
}

export function ProductionHubPage() {
  const navigate = useNavigate();
  const [dash] = createResource(async () => {
    const res = await apiFetch<Dashboard>("/api/v1/manufacturing/dashboard", undefined, { silent: true });
    if (!res.success || !res.data) return null;
    return res.data;
  });

  return (
    <div class="space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Manufacturing</h1>
          <p class="mt-1 text-sm text-text-secondary">Plan. Produce. Track. Grow.</p>
        </div>
        <A
          href={newAssemblyOrderHref()}
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + New production order
        </A>
      </header>

      <Show when={dash.error}>
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Could not load live dashboard metrics. You can still open Assembly or Cutting jobs.
        </p>
      </Show>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total production today"
          value={dash()?.kpi.total_production_today?.toLocaleString() ?? "—"}
          hint="Units completed today"
        />
        <KpiCard
          label="In progress"
          value={String(dash()?.kpi.in_progress_orders ?? "—")}
          hint="Started jobs"
        />
        <KpiCard
          label="Completed today"
          value={String(dash()?.kpi.completed_today ?? "—")}
          hint="Orders finished today"
        />
        <KpiCard
          label="Material shortage"
          value={String(dash()?.kpi.material_shortage_items ?? "—")}
          hint="Items short on open jobs"
          danger={(dash()?.kpi.material_shortage_items ?? 0) > 0}
        />
      </div>

      <section>
        <h2 class="mb-2 text-sm font-semibold text-text-primary">Create new production order</h2>
        <div class="grid gap-3 md:grid-cols-3">
          <For each={[...TYPE_CARDS]}>
            {(card) => (
              <button
                type="button"
                class={`rounded-xl border p-4 text-left transition ${card.color}`}
                onClick={() => navigate(card.href)}
                aria-label={card.title}
              >
                <span class={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${card.badge}`}>
                  {card.title}
                </span>
                <p class="mt-2 text-sm font-medium text-text-primary">{card.description}</p>
                <p class="mt-1 text-xs text-text-secondary">{card.example}</p>
              </button>
            )}
          </For>
        </div>
      </section>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <section class="rounded-xl border border-stroke bg-white">
          <div class="flex items-center justify-between border-b border-stroke px-4 py-3">
            <h2 class="text-sm font-semibold">Recent production orders</h2>
            <A href="/app/production/all/jobs" class="text-xs font-medium text-brand-700 hover:underline">
              View all
            </A>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs text-text-secondary">
                <tr>
                  <th class="px-3 py-2 font-medium">Order</th>
                  <th class="px-3 py-2 font-medium">Type</th>
                  <th class="px-3 py-2 font-medium">Product / input</th>
                  <th class="px-3 py-2 font-medium">Qty</th>
                  <th class="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={(dash()?.recent_orders?.length ?? 0) > 0}
                  fallback={
                    <tr>
                      <td colSpan={5} class="px-3 py-6 text-center text-text-secondary">
                        No orders yet. Start with Assembly.
                      </td>
                    </tr>
                  }
                >
                  <For each={dash()?.recent_orders ?? []}>
                    {(o) => (
                      <tr class="border-t border-stroke/80 hover:bg-slate-50/80">
                        <td class="px-3 py-2">
                          <A href={jobsHrefForOrder(o)} class="font-medium text-brand-700 hover:underline">
                            {o.work_order_no}
                          </A>
                        </td>
                        <td class="px-3 py-2 text-xs">{typeLabel(o.bom_type)}</td>
                        <td class="px-3 py-2">{o.product_label}</td>
                        <td class="px-3 py-2">
                          {o.qty_produced || o.qty_to_produce}
                          {o.finished_unit_code ? ` ${o.finished_unit_code}` : ""}
                        </td>
                        <td class="px-3 py-2">
                          <StatusChip status={o.status} />
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </section>

        <div class="space-y-4">
          <section class="rounded-xl border border-stroke bg-white p-4">
            <h2 class="text-sm font-semibold">Quick actions</h2>
            <div class="mt-3 flex flex-col gap-2">
              <A href={newAssemblyOrderHref()} class="rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
                + New production order
              </A>
              <A href="/app/production/assembly/recipes" class="rounded-lg border border-stroke px-3 py-2 text-center text-sm hover:bg-slate-50">
                Manage BOM / recipes
              </A>
              <A href="/app/production/all/jobs?status=completed" class="rounded-lg border border-stroke px-3 py-2 text-center text-sm hover:bg-slate-50">
                View production history
              </A>
              <A href="/app/production/reports" class="rounded-lg border border-stroke px-3 py-2 text-center text-sm hover:bg-slate-50">
                Open reports
              </A>
            </div>
          </section>

          <section class="rounded-xl border border-stroke bg-white p-4">
            <h2 class="text-sm font-semibold">Material shortage</h2>
            <Show
              when={(dash()?.shortages?.length ?? 0) > 0}
              fallback={<p class="mt-2 text-xs text-text-secondary">No shortages on open jobs.</p>}
            >
              <ul class="mt-3 space-y-2">
                <For each={dash()?.shortages ?? []}>
                  {(s) => (
                    <li class="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-xs">
                      <p class="font-medium text-red-900">
                        {s.component_name || s.component_code}
                      </p>
                      <p class="text-red-800">
                        {s.available_qty}/{s.required_qty} · short {s.shortage_qty} · {s.work_order_no}
                      </p>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <section class="rounded-xl border border-stroke bg-white p-4">
            <h2 class="text-sm font-semibold">Recent activity</h2>
            <ul class="mt-3 space-y-2">
              <For each={dash()?.recent_activity ?? []}>
                {(a) => (
                  <li class="flex gap-2 text-xs text-text-secondary">
                    <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>
                      <span class="font-medium text-text-primary">{a.summary}</span>
                      <span class="block opacity-80">{a.action}</span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const KpiCard = (props: { label: string; value: string; hint: string; danger?: boolean }) => (
  <div
    class="rounded-xl border bg-white px-4 py-3 shadow-sm"
    classList={{
      "border-red-200": !!props.danger,
      "border-stroke": !props.danger,
    }}
  >
    <p class="text-xs font-medium text-text-secondary">{props.label}</p>
    <p
      class="mt-1 text-2xl font-semibold tabular-nums"
      classList={{ "text-red-700": !!props.danger, "text-text-primary": !props.danger }}
    >
      {props.value}
    </p>
    <p class="mt-0.5 text-[11px] text-text-secondary">{props.hint}</p>
  </div>
);

const StatusChip = (props: { status: string }) => {
  const label = () => floorStatusLabel(props.status);
  return (
    <span
      class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      classList={{
        "bg-slate-100 text-slate-700": props.status === "draft",
        "bg-blue-100 text-blue-800": props.status === "released",
        "bg-emerald-100 text-emerald-800": props.status === "completed",
        "bg-red-100 text-red-800": props.status === "cancelled",
      }}
    >
      {label()}
    </span>
  );
};
