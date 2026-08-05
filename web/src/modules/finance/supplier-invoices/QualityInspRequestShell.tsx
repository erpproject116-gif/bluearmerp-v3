import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";

type GrRow = {
  id: number;
  purchase_order_no?: string;
  status: string;
  receipt_date?: string;
};

/** Ecount New Purchases L2 “New Quality Insp. Request” shell — creates QC from a Goods Receipt. */
export function QualityInspRequestShell() {
  const toast = useToast();
  const client = useQueryClient();
  const [grId, setGrId] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const draftGr = createQuery(() => ({
    queryKey: ["gr-for-qc-shell"],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "20", sort: "receipt_date", order: "desc", status: "draft" });
      const res = await apiFetch<GrRow[]>(`/api/v1/goods-receipt/goods-receipts?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load goods receipts");
      return res.data ?? [];
    },
  }));

  const create = async () => {
    const id = Number(grId());
    if (!id) {
      toast.warning("Select a goods receipt.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/quality/qc-requests", {
      method: "POST",
      body: JSON.stringify({
        source_type: "goods_receipt",
        goods_receipt_id: id,
        notes: notes().trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create QC request.");
      return;
    }
    toast.success(res.message ?? "QC request created.");
    void client.invalidateQueries({ queryKey: ["qc-requests"] });
    setNotes("");
  };

  return (
    <div class="rounded-xl border border-stroke bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-text-primary">New Quality Insp. Request</h2>
      <p class="mt-2 max-w-xl text-sm text-text-secondary">
        Quality inspection requests are tied to Purchase Receive in Bluearm (same as Ecount’s GR-based QC path).
        Pick a receipt below or open the full QC list.
      </p>

      <div class="mt-4 grid max-w-lg gap-3">
        <Field label="Purchase Receive">
          <select class={inputClass} value={grId()} onChange={(e) => setGrId(e.currentTarget.value)}>
            <option value="">Select…</option>
            <For each={draftGr.data ?? []}>
              {(r) => (
                <option value={r.id}>
                  Receive #{r.id}
                  {r.purchase_order_no ? ` · PO ${r.purchase_order_no}` : ""}
                  {r.receipt_date ? ` · ${r.receipt_date}` : ""}
                </option>
              )}
            </For>
          </select>
        </Field>
        <Show when={draftGr.isFetching}>
          <p class="text-xs text-text-secondary">Loading draft receipts…</p>
        </Show>
        <Field label="Notes">
          <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={saving()}
            onClick={() => void create()}
          >
            {saving() ? "Creating…" : "Create QC request"}
          </button>
          <A
            href="/app/quality/qc-requests"
            class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          >
            QC request list
          </A>
          <A
            href="/app/purchase-order/goods-receipt"
            class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          >
            Purchase Receive
          </A>
        </div>
      </div>
    </div>
  );
}
