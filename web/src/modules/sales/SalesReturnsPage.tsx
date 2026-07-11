import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { modalDismissClass } from "../../shared/Modal";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { ReturnSerialPicker } from "../../shared/ReturnSerialPicker";
import { useToast } from "../../shared/toast";
import { uiLabel } from "../../shared/branding/uiLabel";

type SalesReturnRow = {
  id: number;
  return_no: string;
  return_date: string;
  sales_id: number;
  status: string;
  grand_total: number;
};

type SalesLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  returned_qty?: number;
  line_total: number;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_policy?: string;
  lot_no?: string;
  serial_lot_no?: string;
  serial_units?: { id: number; serial_no: string }[];
};

type SalesDetail = {
  id: number;
  sales_no: string;
  date_no_display: string;
  partner_name: string;
  lines?: SalesLine[];
};

async function fetchSalesInvoices(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", sort: "order_date", order: "desc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; sales_no: string; date_no_display: string; partner_name: string }[]>(
    `/api/v1/sales/sales?${qs}`,
  );
  return (res.data ?? []).map((s) => ({
    id: s.id,
    label: `${s.date_no_display} — ${s.sales_no}`,
    sublabel: s.partner_name,
  }));
}

export default function SalesReturnsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [salesLabel, setSalesLabel] = createSignal("");
  const [salesId, setSalesId] = createSignal<number | null>(null);
  const [salesDetail, setSalesDetail] = createSignal<SalesDetail | null>(null);
  const [returnQtys, setReturnQtys] = createSignal<Record<number, string>>({});
  const [returnSerials, setReturnSerials] = createSignal<Record<number, number[]>>({});
  const [creating, setCreating] = createSignal(false);
  const [submittingId, setSubmittingId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["sales-returns"],
    queryFn: async () => {
      const res = await apiFetch<SalesReturnRow[]>("/api/v1/sales/sales-returns?pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["sales-returns"] });

  const loadSales = async (id: number) => {
    const res = await apiFetch<SalesDetail>(`/api/v1/sales/sales/${id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load sales invoice.");
      return;
    }
    setSalesDetail(res.data);
    const qtys: Record<number, string> = {};
    const serials: Record<number, number[]> = {};
    for (const ln of res.data.lines ?? []) {
      const remaining = ln.qty - (ln.returned_qty ?? 0);
      if (remaining > 0) {
        qtys[ln.id] = String(remaining);
        if (ln.track_serial && ln.serial_units?.length) {
          const take = Math.min(Math.floor(remaining), ln.serial_units.length);
          serials[ln.id] = ln.serial_units.slice(0, take).map((u) => u.id);
        }
      }
    }
    setReturnQtys(qtys);
    setReturnSerials(serials);
  };

  const resetCreate = () => {
    setSalesLabel("");
    setSalesId(null);
    setSalesDetail(null);
    setReturnQtys({});
    setReturnSerials({});
  };

  const createReturn = async () => {
    const sid = salesId();
    if (!sid) {
      toast.warning("Select a sales invoice.");
      return;
    }
    const lines = (salesDetail()?.lines ?? [])
      .map((ln) => {
        const qty = Number(returnQtys()[ln.id] ?? 0);
        const serialIds = returnSerials()[ln.id] ?? [];
        return {
          sales_line_id: ln.id,
          qty,
          serial_unit_ids: ln.track_serial && serialIds.length ? serialIds : undefined,
        };
      })
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      toast.warning("Enter return quantity for at least one line.");
      return;
    }
    for (const ln of salesDetail()?.lines ?? []) {
      const qty = Number(returnQtys()[ln.id] ?? 0);
      if (qty <= 0) continue;
      if (!ln.track_serial) continue;
      const required = (ln.serial_policy ?? "required") !== "optional";
      const serialIds = returnSerials()[ln.id] ?? [];
      if (required && serialIds.length !== Math.floor(qty)) {
        toast.warning(`${ln.item_code}: select ${Math.floor(qty)} serial number(s) to return.`);
        return;
      }
    }
    setCreating(true);
    const res = await apiFetch<{ return_no: string }>("/api/v1/sales/sales-returns", {
      method: "POST",
      body: JSON.stringify({ sales_id: sid, lines }),
    });
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create return.");
      return;
    }
    toast.success(`Return ${res.data?.return_no ?? "created"}.`);
    resetCreate();
    setCreateOpen(false);
    invalidate();
  };

  const submitReturn = async (row: SalesReturnRow) => {
    if (row.status !== "draft") return;
    setSubmittingId(row.id);
    const res = await apiFetch(`/api/v1/sales/sales-returns/${row.id}/submit`, { method: "POST" });
    setSubmittingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to submit return.");
      return;
    }
    toast.success("Return submitted.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-slate-900">Sales Returns</h1>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => setCreateOpen(true)}
        >
          New return
        </button>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <table class="min-w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Return No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Sales ID</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-right">Total</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">{row.return_no}</td>
                  <td class="px-3 py-2">{row.return_date}</td>
                  <td class="px-3 py-2">{row.sales_id}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2 text-right">{row.grand_total.toFixed(2)}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <ActivityHistoryLink
                        module="sales"
                        targetType="sr_sales_return"
                        targetId={row.id}
                        title={`History — ${row.return_no}`}
                      />
                      <Show when={row.status === "draft"}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline disabled:opacity-50"
                          disabled={submittingId() === row.id}
                          onClick={() => void submitReturn(row)}
                        >
                          {submittingId() === row.id ? "Submitting…" : "Submit"}
                        </button>
                      </Show>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={createOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-3xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New Sales Return</h2>
              <button
                type="button"
                class={modalDismissClass}
                onClick={() => {
                  resetCreate();
                  setCreateOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <LookupCombo
              label="Sales Invoice"
              required
              value={salesLabel}
              selectedId={salesId}
              onInput={setSalesLabel}
              onSelect={(o) => {
                setSalesId(o.id);
                setSalesLabel(o.label);
                void loadSales(o.id);
              }}
              onClear={() => {
                resetCreate();
              }}
              fetchOptions={fetchSalesInvoices}
            />
            <Show when={salesDetail()}>
              {(d) => (
                <div class="mt-4">
                  <p class="mb-2 text-sm text-text-secondary">{d().partner_name}</p>
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                      <tr>
                        <th class="px-2 py-2">Item</th>
                        <th class="px-2 py-2 text-right">Sold</th>
                        <th class="px-2 py-2 text-right">Returned</th>
                        <th class="px-2 py-2 text-right">Return qty</th>
                        <th class="px-2 py-2">Serial / lot</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d().lines ?? []}>
                        {(ln) => (
                          <tr class="border-t border-stroke">
                            <td class="px-2 py-2">
                              {ln.item_code} — {ln.item_name}
                            </td>
                            <td class="px-2 py-2 text-right">{ln.qty}</td>
                            <td class="px-2 py-2 text-right">{ln.returned_qty ?? 0}</td>
                            <td class="px-2 py-2 text-right">
                              <input
                                type="number"
                                class="w-24 rounded border border-stroke px-2 py-1 text-right"
                                min="0"
                                max={ln.qty - (ln.returned_qty ?? 0)}
                                value={returnQtys()[ln.id] ?? ""}
                                onInput={(e) => {
                                  const raw = e.currentTarget.value;
                                  setReturnQtys((prev) => ({ ...prev, [ln.id]: raw }));
                                  const nextQty = Math.floor(Number(raw) || 0);
                                  if (ln.track_serial && ln.serial_units?.length) {
                                    const cur = returnSerials()[ln.id] ?? [];
                                    if (cur.length > nextQty) {
                                      setReturnSerials((prev) => ({
                                        ...prev,
                                        [ln.id]: cur.slice(0, nextQty),
                                      }));
                                    }
                                  }
                                }}
                              />
                            </td>
                            <td class="px-2 py-2">
                              <Show when={ln.track_serial}>
                                <ReturnSerialPicker
                                  soldUnits={ln.serial_units ?? []}
                                  returnQty={Number(returnQtys()[ln.id] ?? 0)}
                                  selectedIds={returnSerials()[ln.id] ?? []}
                                  serialPolicy={ln.serial_policy}
                                  onChange={(ids) =>
                                    setReturnSerials((prev) => ({ ...prev, [ln.id]: ids }))
                                  }
                                />
                              </Show>
                              <Show when={ln.track_lot && !ln.track_serial}>
                                <p class="text-xs text-text-secondary">
                                  Lot: {ln.lot_no || ln.serial_lot_no || "—"}
                                  <span class="block text-[10px] uppercase tracking-wide">
                                    Restores to same lot on submit
                                  </span>
                                </p>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </Show>
            <div class="mt-6 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  resetCreate();
                  setCreateOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={creating()}
                onClick={() => void createReturn()}
              >
                {creating() ? "Creating…" : "Create return"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
