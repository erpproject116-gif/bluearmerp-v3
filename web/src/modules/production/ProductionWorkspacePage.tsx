import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { ProductionLayout } from "./ProductionLayout";

type WorkOrder = {
  id: number;
  work_order_no: string;
  status: string;
  inspection_status?: string;
  order_date?: string;
  completed_at?: string | null;
};

type QueueDef = {
  id: string;
  label: string;
  hint: string;
  href: string;
  match: (wo: WorkOrder) => boolean;
  accent?: string;
};

const QUEUES: QueueDef[] = [
  {
    id: "draft",
    label: "Draft",
    hint: "Create or release to the floor",
    href: "/app/production/work-orders?status=draft",
    match: (wo) => wo.status === "draft",
  },
  {
    id: "qc",
    label: "Needs FG QC",
    hint: "Release inspection before Complete",
    href: "/app/production/work-orders?status=released",
    match: (wo) =>
      wo.status === "released" &&
      (wo.inspection_status === "pending" || wo.inspection_status === "held"),
    accent: "text-amber-700",
  },
  {
    id: "released",
    label: "In production",
    hint: "Issue / receive (if tracked), then Complete",
    href: "/app/production/work-orders?status=released",
    match: (wo) =>
      wo.status === "released" &&
      (wo.inspection_status === "released" || !wo.inspection_status),
  },
  {
    id: "completed",
    label: "Completed (recent)",
    hint: "Finished goods in stock — ready to sell",
    href: "/app/production/work-orders?status=completed",
    match: (wo) => {
      if (wo.status !== "completed") return false;
      const raw = wo.completed_at ?? wo.order_date;
      if (!raw) return true;
      const t = Date.parse(raw);
      if (Number.isNaN(t)) return true;
      return Date.now() - t <= 14 * 24 * 60 * 60 * 1000;
    },
  },
];

async function fetchWorkOrdersPage(status: string): Promise<WorkOrder[]> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "100",
    sort: "order_date",
    order: "desc",
  });
  if (status) qs.set("status", status);
  const res = await apiFetch<WorkOrder[]>(`/api/v1/manufacturing/work-orders?${qs}`);
  return res.data ?? [];
}

export default function ProductionWorkspacePage() {
  const auth = useAuth();

  const draftQ = createQuery(() => ({
    queryKey: ["production-workspace", "draft"],
    queryFn: () => fetchWorkOrdersPage("draft"),
  }));
  const releasedQ = createQuery(() => ({
    queryKey: ["production-workspace", "released"],
    queryFn: () => fetchWorkOrdersPage("released"),
  }));
  const completedQ = createQuery(() => ({
    queryKey: ["production-workspace", "completed"],
    queryFn: () => fetchWorkOrdersPage("completed"),
  }));

  const allRows = createMemo(() => [
    ...(draftQ.data ?? []),
    ...(releasedQ.data ?? []),
    ...(completedQ.data ?? []),
  ]);

  const counts = createMemo(() => {
    const rows = allRows();
    return Object.fromEntries(QUEUES.map((q) => [q.id, rows.filter(q.match).length]));
  });

  const loading = () => draftQ.isFetching || releasedQ.isFetching || completedQ.isFetching;

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <h1 class="text-lg font-semibold text-text-primary">Production</h1>
          <p class="mt-1 text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
          <p class="mt-3 text-sm text-text-primary">
            <span class="font-medium">BOM → Work order → Release → Complete → Stock → Sell.</span>{" "}
            Make-to-order from a sales order, or make-to-stock without one. Serial/lot stations only when items are tracked.
          </p>
        </section>

        <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <A
            href="/app/production/work-orders"
            class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md sm:col-span-2 lg:col-span-1"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Primary</p>
            <h2 class="mt-1 text-lg font-semibold text-text-primary">Work orders</h2>
            <p class="mt-2 text-sm text-text-secondary">
              Create, release, QC, complete — and open Issue / Receive from a released row.
            </p>
          </A>
          <A
            href="/app/production/boms"
            class="rounded-xl border border-stroke bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <h2 class="font-semibold text-text-primary">BOMs</h2>
            <p class="mt-2 text-sm text-text-secondary">Recipes for assembly and disassembly.</p>
          </A>
          <A
            href="/app/production/reports"
            class="rounded-xl border border-stroke bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <h2 class="font-semibold text-text-primary">Reports</h2>
            <p class="mt-2 text-sm text-text-secondary">Status, progress, and stock movements.</p>
          </A>
        </section>

        <section>
          <h2 class="mb-3 text-sm font-semibold text-text-primary">What needs attention</h2>
          <Show when={!loading()} fallback={<p class="text-sm text-text-secondary">Loading queues…</p>}>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <For each={QUEUES}>
                {(q) => (
                  <A
                    href={q.href}
                    class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
                  >
                    <p class="text-sm text-text-secondary">{q.label}</p>
                    <p class={`mt-2 text-3xl font-bold ${q.accent ?? "text-text-primary"}`}>
                      {counts()[q.id] ?? 0}
                    </p>
                    <p class="mt-1 text-xs text-text-secondary">{q.hint}</p>
                  </A>
                )}
              </For>
            </div>
          </Show>
        </section>

        <p class="text-xs text-text-secondary">
          Serial / lot stations (optional):{" "}
          <A href="/app/production/issue-station" class="text-brand-700 underline-offset-2 hover:underline">
            Issue materials
          </A>
          {" · "}
          <A href="/app/production/receive-station" class="text-brand-700 underline-offset-2 hover:underline">
            Receive finished goods
          </A>
          . Prefer opening them from a released work order.
        </p>
      </div>
    </ProductionLayout>
  );
}
