import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";

type Day1Row = {
  customer_id: number;
  email: string;
  full_name: string;
  company_name: string;
  tenant_id?: number;
  company_code?: string;
  commercial_status: string;
  day1_completed_at?: string;
  payment_requested_at?: string;
  amount_centavos: number;
  day1_snapshot?: { active_locations?: number; active_items?: number; items_with_stock?: number };
  payment_note?: string;
};

type StatusFilter = "all_locked" | "awaiting_payment" | "setup" | "cancelled";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all_locked", label: "All locked" },
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "setup", label: "Still in setup" },
  { id: "cancelled", label: "Cancelled" },
];

function formatPeso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlatformDay1PaymentsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [notes, setNotes] = createSignal<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all_locked");

  const q = createQuery(() => ({
    queryKey: ["platform-day1-payments", statusFilter()],
    queryFn: async () => {
      const res = await apiFetch<{ rows: Day1Row[]; status: string }>(
        `/api/v1/platform/console/day1-payments?status=${statusFilter()}`,
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load Day 1 payments");
      return res.data!;
    },
  }));

  const act = async (id: number, kind: "confirm" | "reject") => {
    setBusyId(id);
    try {
      const path =
        kind === "confirm"
          ? `/api/v1/platform/console/customers/${id}/confirm-day1-payment`
          : `/api/v1/platform/console/customers/${id}/reject-day1-payment`;
      const res = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ note: notes()[id] ?? "" }),
      });
      if (!res.ok) {
        toast.error(res.message ?? "Action failed");
        return;
      }
      toast.success(kind === "confirm" ? "Payment confirmed — workspace unlocked." : "Day 1 payment rejected.");
      await qc.invalidateQueries({ queryKey: ["platform-day1-payments"] });
      await qc.invalidateQueries({ queryKey: ["platform-command-overview"] });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-semibold">Day 1 payments</h2>
        <p class="mt-1 text-sm text-slate-500">
          Locked workspaces waiting for manual checkout confirmation ({formatPeso(450000)}). Includes setup (Day 1
          incomplete) — they may still see the QR when opening buy/sell. Confirm or activate a paid plan on the
          customer page to unlock trading.
        </p>
      </div>

      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Commercial lock filter">
        <For each={FILTERS}>
          {(f) => (
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter() === f.id}
              class="rounded-lg border px-3 py-1.5 text-xs font-medium"
              classList={{
                "border-brand-600 bg-brand-50 text-brand-900": statusFilter() === f.id,
                "border-slate-200 bg-white text-slate-600 hover:bg-slate-50": statusFilter() !== f.id,
              }}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          )}
        </For>
      </div>

      <Show when={q.isLoading}>
        <p class="text-sm text-slate-500">Loading…</p>
      </Show>
      <Show when={q.isError}>
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {(q.error as Error)?.message ?? "Failed to load."}
        </p>
      </Show>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3 font-medium">Company</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Day 1</th>
              <th class="px-4 py-3 font-medium">Amount</th>
              <th class="px-4 py-3 font-medium">GCash note</th>
              <th class="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <Show when={(q.data?.rows ?? []).length === 0}>
              <tr>
                <td colspan={6} class="px-4 py-8 text-center text-slate-500">
                  No locked tenants in this filter.
                </td>
              </tr>
            </Show>
            <For each={q.data?.rows ?? []}>
              {(row) => (
                <tr>
                  <td class="px-4 py-3 align-top">
                    <p class="font-medium text-slate-900">{row.company_name || row.full_name || "—"}</p>
                    <p class="text-xs text-slate-500">{row.email}</p>
                    <Show when={row.company_code}>
                      <p class="text-xs text-slate-400">{row.company_code}</p>
                    </Show>
                    <A
                      href={`/app/platform-command/customers/${row.customer_id}`}
                      class="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                    >
                      Customer detail
                    </A>
                  </td>
                  <td class="px-4 py-3 align-top text-xs font-medium text-slate-700">
                    {row.commercial_status.replace(/_/g, " ")}
                  </td>
                  <td class="px-4 py-3 align-top text-xs text-slate-600">
                    <Show when={row.day1_completed_at}>
                      <p>Completed {new Date(row.day1_completed_at!).toLocaleString()}</p>
                    </Show>
                    <Show when={!row.day1_completed_at}>
                      <p class="text-amber-800">Day 1 not marked complete</p>
                    </Show>
                    <Show when={row.day1_snapshot}>
                      <p class="mt-1">
                        Loc {row.day1_snapshot!.active_locations ?? 0} · Items{" "}
                        {row.day1_snapshot!.active_items ?? 0} · Stock SKUs{" "}
                        {row.day1_snapshot!.items_with_stock ?? 0}
                      </p>
                    </Show>
                  </td>
                  <td class="px-4 py-3 align-top font-medium tabular-nums">
                    {formatPeso(row.amount_centavos)}
                  </td>
                  <td class="px-4 py-3 align-top">
                    <input
                      class="w-full min-w-[10rem] rounded border border-slate-200 px-2 py-1.5 text-xs"
                      placeholder="GCash ref / memo"
                      value={notes()[row.customer_id] ?? ""}
                      onInput={(e) =>
                        setNotes({ ...notes(), [row.customer_id]: e.currentTarget.value })
                      }
                    />
                  </td>
                  <td class="px-4 py-3 align-top">
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        disabled={busyId() === row.customer_id}
                        onClick={() => void act(row.customer_id, "confirm")}
                      >
                        Unlock
                      </button>
                      <Show when={row.commercial_status === "awaiting_payment"}>
                        <button
                          type="button"
                          class="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          disabled={busyId() === row.customer_id}
                          onClick={() => void act(row.customer_id, "reject")}
                        >
                          Reject
                        </button>
                      </Show>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
