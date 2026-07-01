import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";

type RfqLine = {
  id: number;
  line_no: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  qty: number;
};

type SupplierQuotationDetail = {
  id: number;
  rfq_id: number;
  partner_id: number;
  quote_date: string;
  quote_no: string;
  status: string;
  valid_until?: string | null;
  notes?: string | null;
  lines: Array<{
    id: number;
    line_no: number;
    rfq_request_line_id?: number | null;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
};

type Props = {
  open: boolean;
  rfqId: number;
  rfqLines: RfqLine[];
  quotationId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

type LineDraft = {
  rfq_request_line_id: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: string;
};

async function fetchVendors(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_code: string; partner_kind: string }[]>(
    `/api/v1/inventory/partners?${qs}`,
  );
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name, sublabel: p.partner_code }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function SupplierQuotationModal(props: Props) {
  const toast = useToast();
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [quoteDate, setQuoteDate] = createSignal(todayISO());
  const [validUntil, setValidUntil] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<LineDraft[]>([]);

  const isEdit = createMemo(() => props.quotationId != null);

  const resetFromRfq = () => {
    setPartnerId(null);
    setPartnerLabel("");
    setQuoteDate(todayISO());
    setValidUntil("");
    setNotes("");
    setLines(
      props.rfqLines.map((ln) => ({
        rfq_request_line_id: ln.id,
        item_id: ln.item_id ?? null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: ln.qty,
        unit_price: "0",
      })),
    );
  };

  const loadDetail = async (id: number) => {
    setLoading(true);
    const res = await apiFetch<SupplierQuotationDetail>(`/api/v1/purchase-order/supplier-quotations/${id}`);
    setLoading(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load supplier quotation.");
      props.onClose();
      return;
    }
    const sq = res.data;
    setPartnerId(sq.partner_id);
    setPartnerLabel("");
    setQuoteDate(sq.quote_date);
    setValidUntil(sq.valid_until ?? "");
    setNotes(sq.notes ?? "");
    setLines(
      sq.lines.map((ln) => ({
        rfq_request_line_id: ln.rfq_request_line_id ?? 0,
        item_id: ln.item_id ?? null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: ln.qty,
        unit_price: String(ln.unit_price ?? 0),
      })),
    );
  };

  createEffect(() => {
    if (!props.open) return;
    if (props.quotationId) {
      void loadDetail(props.quotationId);
      return;
    }
    resetFromRfq();
  });

  const grandTotal = createMemo(() =>
    lines().reduce((sum, ln) => sum + (ln.qty || 0) * (Number(ln.unit_price || "0") || 0), 0),
  );

  const save = async () => {
    if (!partnerId()) {
      toast.warning("Supplier is required.");
      return;
    }
    const payload = {
      rfq_id: props.rfqId,
      partner_id: partnerId(),
      quote_date: quoteDate() || todayISO(),
      valid_until: validUntil() || null,
      notes: notes() || null,
      lines: lines().map((ln, idx) => ({
        line_no: idx + 1,
        rfq_request_line_id: ln.rfq_request_line_id || undefined,
        item_id: ln.item_id ?? undefined,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: ln.qty,
        unit_price: Number(ln.unit_price || "0"),
      })),
    };

    setSaving(true);
    const res = await apiFetch(
      isEdit()
        ? `/api/v1/purchase-order/supplier-quotations/${props.quotationId}`
        : "/api/v1/purchase-order/supplier-quotations",
      {
        method: isEdit() ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save supplier quotation.");
      return;
    }
    toast.success(isEdit() ? "Supplier quotation updated." : "Supplier quotation created.");
    props.onSaved();
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-5xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-text-primary">
              {isEdit() ? "Edit supplier quotation" : "New supplier quotation"}
            </h2>
            <button type="button" class={modalDismissClass} onClick={props.onClose}>
              Close
            </button>
          </div>

          <Show when={!loading()} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <LookupCombo
                label="Supplier"
                required
                value={partnerLabel}
                selectedId={partnerId}
                onInput={setPartnerLabel}
                onSelect={(o) => {
                  setPartnerId(o.id);
                  setPartnerLabel(o.label);
                }}
                onClear={() => {
                  setPartnerId(null);
                  setPartnerLabel("");
                }}
                fetchOptions={fetchVendors}
              />
              <label class="text-sm">
                <span class="text-text-secondary">Quote date</span>
                <input
                  type="date"
                  class="mt-1 w-full rounded border border-stroke px-2 py-1"
                  value={quoteDate()}
                  onInput={(e) => setQuoteDate(e.currentTarget.value)}
                />
              </label>
              <label class="text-sm">
                <span class="text-text-secondary">Valid until</span>
                <input
                  type="date"
                  class="mt-1 w-full rounded border border-stroke px-2 py-1"
                  value={validUntil()}
                  onInput={(e) => setValidUntil(e.currentTarget.value)}
                />
              </label>
              <label class="text-sm md:col-span-2">
                <span class="text-text-secondary">Notes</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded border border-stroke px-2 py-1"
                  value={notes()}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                />
              </label>
            </div>

            <div class="mt-4 overflow-x-auto rounded border border-stroke">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left">
                  <tr>
                    <th class="px-2 py-2">#</th>
                    <th class="px-2 py-2">Item</th>
                    <th class="px-2 py-2 text-right">Qty</th>
                    <th class="px-2 py-2 text-right">Unit price</th>
                    <th class="px-2 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={lines()}>
                    {(ln, idx) => (
                      <tr class="border-t border-stroke">
                        <td class="px-2 py-2">{idx() + 1}</td>
                        <td class="px-2 py-2">
                          {ln.item_code} — {ln.item_name}
                        </td>
                        <td class="px-2 py-2 text-right">{ln.qty}</td>
                        <td class="px-2 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            class="w-28 rounded border border-stroke px-2 py-1 text-right"
                            value={ln.unit_price}
                            onInput={(e) => {
                              const v = e.currentTarget.value;
                              setLines((prev) => {
                                const next = [...prev];
                                next[idx()] = { ...next[idx()], unit_price: v };
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td class="px-2 py-2 text-right">
                          {(ln.qty * (Number(ln.unit_price || "0") || 0)).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <p class="mt-3 text-right text-sm font-medium">
              Grand total:{" "}
              {grandTotal().toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>

            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={saving()}
                onClick={() => void save()}
              >
                {saving() ? "Saving…" : isEdit() ? "Update quotation" : "Create quotation"}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
