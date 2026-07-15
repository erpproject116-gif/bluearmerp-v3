import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../../shared/entityTypes";
import { useToast } from "../../../shared/toast";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { useOpenDeliveryLines, type OpenDeliveryLine } from "../../../shared/useDeliveryReceiptList";
import { uiLabel } from "../../../shared/branding/uiLabel";

type LineRow = {
  sales_order_line_id: number;
  sales_order_release_line_id?: number;
  label: string;
  qty: string;
  balance_qty: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  prefilterSalesOrderId?: number | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function DeliveryReceiptModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [deliveryDate, setDeliveryDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [deliveryNo, setDeliveryNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<LineRow[]>([]);

  const openLines = useOpenDeliveryLines(() => props.open);

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; delivery_no: string }>(
      `/api/v1/sales-order/delivery-receipts/preview-sequences?delivery_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setDeliveryNo(res.data.delivery_no);
    }
  };

  const reset = () => {
    setDeliveryDate(todayISO());
    setNotes("");
    setLines([]);
    void loadPreview(todayISO());
  };

  createEffect(() => {
    if (!props.open) return;
    reset();
  });

  createEffect(() => {
    if (!props.open || !props.prefilterSalesOrderId) return;
    const soId = props.prefilterSalesOrderId;
    const rows = openLines.data ?? [];
    if (rows.length === 0) return;
    const matching = rows.filter((r) => r.sales_order_id === soId);
    if (matching.length === 0) return;
    setLines(
      matching.map((row) => ({
        sales_order_line_id: row.sales_order_line_id,
        sales_order_release_line_id: row.sales_order_release_line_id,
        label: `${row.sales_order_no} — ${row.item_code} ${row.item_name} (${row.customer_name})`,
        qty: String(row.balance_qty),
        balance_qty: row.balance_qty,
      })),
    );
  });

  createEffect(() => {
    if (!props.open) return;
    void loadPreview(deliveryDate());
  });

  const buildDraftPayload = () => ({
    delivery_date: deliveryDate(),
    notes: notes(),
    lines: lines(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setDeliveryDate(payload.delivery_date);
    setNotes(payload.notes);
    setLines(payload.lines ?? []);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.soDeliveryReceipt,
    draftKey: () => (props.prefilterSalesOrderId ? `so-${props.prefilterSalesOrderId}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // No autoApply: when prefilterSalesOrderId is set, the effect above async-fills lines from
    // openLines.data, which can resolve after draft recovery and stomp the recovered lines.
  });

  const addLine = (row: OpenDeliveryLine) => {
    if (lines().some((l) => l.sales_order_line_id === row.sales_order_line_id)) {
      toast.warning("Line already added.");
      return;
    }
    setLines((rows) => [
      ...rows,
      {
        sales_order_line_id: row.sales_order_line_id,
        sales_order_release_line_id: row.sales_order_release_line_id,
        label: `${row.sales_order_no} — ${row.item_code} ${row.item_name} (${row.customer_name})`,
        qty: String(row.balance_qty),
        balance_qty: row.balance_qty,
      },
    ]);
  };

  const save = async () => {
    const bodyLines = lines()
      .filter((l) => Number(l.qty) > 0)
      .map((l) => ({
        sales_order_line_id: l.sales_order_line_id,
        sales_order_release_line_id: l.sales_order_release_line_id,
        qty: Number(l.qty),
      }));
    if (bodyLines.length === 0) {
      toast.warning("Add at least one released sales order line.");
      return;
    }
    for (const l of lines()) {
      const qty = Number(l.qty);
      if (qty > l.balance_qty + 0.0001) {
        toast.warning(`Quantity exceeds balance for ${l.label}.`);
        return;
      }
    }

    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch("/api/v1/sales-order/delivery-receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_date: deliveryDate(),
            notes: notes().trim() || null,
            lines: bodyLines,
          }),
        }),
      toast,
      "Delivery receipt saved.",
    );
    setSaving(false);
    if (ok) {
      await draft.clearOnSave();
      props.onSaved();
    }
  };

  return (
    <WideEntityModal
      open={props.open}
      title="New delivery receipt"
      onClose={props.onClose}
      onSave={save}
      saving={saving()}
    >
      <draft.DraftBanner />
      <div class="grid gap-4 md:grid-cols-3">
        <Field label="Delivery date">
          <DateInput value={deliveryDate()} onChange={setDeliveryDate} class={inputClass} />
        </Field>
        <Field label="Date-no">
          <input class={inputClass} value={dateNoDisplay()} readOnly />
        </Field>
        <Field label="Delivery no.">
          <input class={inputClass} value={deliveryNo()} readOnly />
        </Field>
      </div>
      <Field label="Notes">
        <textarea class={`${inputClass} min-h-[60px]`} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 class="mb-2 text-sm font-semibold text-text-primary">Released lines</h3>
          <Show when={!openLines.isFetching} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
            <div class="max-h-56 overflow-y-auto rounded border border-stroke">
              <For each={openLines.data ?? []}>
                {(row) => (
                  <button
                    type="button"
                    class="flex w-full items-start justify-between gap-2 border-b border-stroke px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => addLine(row)}
                  >
                    <span>
                      {row.sales_order_no} — {row.item_code} {row.item_name}
                      <span class="block text-xs text-text-secondary">{row.customer_name}</span>
                    </span>
                    <span class="shrink-0 text-xs text-text-secondary">Bal {row.balance_qty}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <div>
          <h3 class="mb-2 text-sm font-semibold text-text-primary">Lines to deliver</h3>
          <Show when={lines().length > 0} fallback={<p class="text-sm text-text-secondary">Pick released lines from the left.</p>}>
            <div class="space-y-2">
              <For each={lines()}>
                {(line, idx) => (
                  <div class="rounded border border-stroke p-2 text-sm">
                    <div class="mb-1">{line.label}</div>
                    <Field label="Qty">
                      <input
                        class={inputClass}
                        type="number"
                        min="0"
                        step="any"
                        value={line.qty}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((rows) => rows.map((r, i) => (i === idx() ? { ...r, qty: v } : r)));
                        }}
                      />
                    </Field>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </WideEntityModal>
  );
}
