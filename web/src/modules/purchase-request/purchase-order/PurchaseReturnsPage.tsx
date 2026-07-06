import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { useToast } from "../../../shared/toast";

type PurchaseReturnRow = {
  id: number;
  return_no: string;
  return_date: string;
  partner_id: number;
  status: string;
  grand_total: number;
};

type GRLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  received_qty: number;
};

type GRDetail = {
  id: number;
  goods_receipt_no: string;
  partner_id: number;
  partner_name: string;
  status: string;
  lines?: GRLine[];
};

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(
    `/api/v1/inventory/partners?${qs}`,
  );
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchGoodsReceipts(partnerId: number, q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "posted", partner_id: String(partnerId) });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; goods_receipt_no: string; date_no_display: string }[]>(
    `/api/v1/goods-receipt/goods-receipts?${qs}`,
  );
  return (res.data ?? []).map((g) => ({ id: g.id, label: `${g.date_no_display} — ${g.goods_receipt_no}` }));
}

export default function PurchaseReturnsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [grLabel, setGrLabel] = createSignal("");
  const [grId, setGrId] = createSignal<number | null>(null);
  const [grDetail, setGrDetail] = createSignal<GRDetail | null>(null);
  const [returnQtys, setReturnQtys] = createSignal<Record<number, string>>({});
  const [creating, setCreating] = createSignal(false);
  const [submittingId, setSubmittingId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["purchase-returns"],
    queryFn: async () => {
      const res = await apiFetch<PurchaseReturnRow[]>("/api/v1/purchase-order/purchase-returns");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["purchase-returns"] });

  const loadGR = async (id: number) => {
    const res = await apiFetch<GRDetail>(`/api/v1/goods-receipt/goods-receipts/${id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load goods receipt.");
      return;
    }
    setGrDetail(res.data);
    const qtys: Record<number, string> = {};
    for (const ln of res.data.lines ?? []) {
      if (ln.received_qty > 0) qtys[ln.id] = String(ln.received_qty);
    }
    setReturnQtys(qtys);
  };

  const resetCreate = () => {
    setPartnerLabel("");
    setPartnerId(null);
    setGrLabel("");
    setGrId(null);
    setGrDetail(null);
    setReturnQtys({});
  };

  const createReturn = async () => {
    const pid = partnerId();
    if (!pid) {
      toast.warning("Select a vendor.");
      return;
    }
    const lines = (grDetail()?.lines ?? [])
      .map((ln) => ({ goods_receipt_line_id: ln.id, qty: Number(returnQtys()[ln.id] ?? 0) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      toast.warning("Enter return quantity for at least one line.");
      return;
    }
    setCreating(true);
    const res = await apiFetch<{ return_no: string }>("/api/v1/purchase-order/purchase-returns", {
      method: "POST",
      body: JSON.stringify({ partner_id: pid, lines }),
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

  const submitReturn = async (row: PurchaseReturnRow) => {
    if (row.status !== "draft") return;
    setSubmittingId(row.id);
    const res = await apiFetch(`/api/v1/purchase-order/purchase-returns/${row.id}/submit`, { method: "POST" });
    setSubmittingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to submit.");
      return;
    }
    toast.success("Purchase return submitted.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-slate-900">Purchase Returns</h1>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => setCreateOpen(true)}
        >
          New return
        </button>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <table class="min-w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Return No</th>
              <th class="px-3 py-2 text-left">Date</th>
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
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2 text-right">{row.grand_total.toFixed(2)}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <ActivityHistoryLink
                        module="purchase_order"
                        targetType="prt_purchase_return"
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
          <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New Purchase Return</h2>
              <button type="button" class={modalDismissClass} onClick={() => { resetCreate(); setCreateOpen(false); }}>
                Close
              </button>
            </div>
            <LookupCombo
              label="Vendor"
              required
              value={partnerLabel}
              selectedId={partnerId}
              onInput={setPartnerLabel}
              onSelect={(o) => {
                setPartnerId(o.id);
                setPartnerLabel(o.label);
                setGrId(null);
                setGrLabel("");
                setGrDetail(null);
              }}
              onClear={resetCreate}
              fetchOptions={fetchPartners}
            />
            <Show when={partnerId()}>
              <div class="mt-4">
                <LookupCombo
                  label="Goods Receipt (posted)"
                  required
                  value={grLabel}
                  selectedId={grId}
                  onInput={setGrLabel}
                  onSelect={(o) => {
                    setGrId(o.id);
                    setGrLabel(o.label);
                    void loadGR(o.id);
                  }}
                  onClear={() => {
                    setGrId(null);
                    setGrLabel("");
                    setGrDetail(null);
                  }}
                  fetchOptions={(q) => fetchGoodsReceipts(partnerId()!, q)}
                />
              </div>
            </Show>
            <Show when={grDetail()}>
              {(d) => (
                <table class="mt-4 w-full text-sm">
                  <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-2 py-2">Item</th>
                      <th class="px-2 py-2 text-right">Received</th>
                      <th class="px-2 py-2 text-right">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={d().lines ?? []}>
                      {(ln) => (
                        <tr class="border-t border-stroke">
                          <td class="px-2 py-2">{ln.item_code} — {ln.item_name}</td>
                          <td class="px-2 py-2 text-right">{ln.received_qty}</td>
                          <td class="px-2 py-2 text-right">
                            <input
                              type="number"
                              class="w-24 rounded border border-stroke px-2 py-1 text-right"
                              min="0"
                              max={ln.received_qty}
                              value={returnQtys()[ln.id] ?? ""}
                              onInput={(e) =>
                                setReturnQtys((prev) => ({ ...prev, [ln.id]: e.currentTarget.value }))
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              )}
            </Show>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => { resetCreate(); setCreateOpen(false); }}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
