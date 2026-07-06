import { createEffect, createSignal, For, Index, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DecimalInput } from "../../../shared/DecimalInput";
import { parseNum, roundMoney } from "../../../shared/money";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import type { OpenGRLine, SupplierInvoiceDetail } from "../../../shared/useSupplierInvoiceList";
import { OpenGRLinePickerModal } from "./OpenGRLinePickerModal";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";

type LineRow = {
  goods_receipt_line_id: number | null;
  label: string;
  qty: string;
  unit_vat_inc: number;
  line_total: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingId?: number | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchVendors(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

export function SupplierInvoiceModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [invoiceDate, setInvoiceDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [invoiceNo, setInvoiceNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [currencies, setCurrencies] = createSignal<{ id: number; currency_code: string; is_default: boolean }[]>([]);
  const [vendorInvoiceNo, setVendorInvoiceNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [openLines, setOpenLines] = createSignal<OpenGRLine[]>([]);
  const [lines, setLines] = createSignal<LineRow[]>([]);
  const [grPickerOpen, setGrPickerOpen] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; invoice_no: string }>(
      `/api/v1/finance/supplier-invoices/preview-sequences?invoice_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setInvoiceNo(res.data.invoice_no);
    }
  };

  const loadOpenLines = async (pid: number) => {
    const res = await apiFetch<OpenGRLine[]>(`/api/v1/finance/supplier-invoices/open-gr-lines?partner_id=${pid}`);
    setOpenLines(res.data ?? []);
  };

  const reset = () => {
    setInvoiceDate(todayISO());
    setPartnerId(null);
    setVendorLabel("");
    setVendorInvoiceNo("");
    setNotes("");
    setLines([]);
    setOpenLines([]);
    void loadPreview(todayISO());
    void apiFetch<{ id: number; currency_code: string; is_default: boolean }[]>(
      "/api/v1/quotation/currencies?page=1&pageSize=100&status=active",
    ).then((res) => {
      const rows = res.data ?? [];
      setCurrencies(rows);
      const def = rows.find((c) => c.is_default) ?? rows[0];
      if (def) setCurrencyId(def.id);
    });
  };

  createEffect(() => {
    if (!props.open) return;
    reset();
  });

  createEffect(() => {
    if (!props.open) return;
    void loadPreview(invoiceDate());
  });

  createEffect(() => {
    const pid = partnerId();
    if (pid) void loadOpenLines(pid);
  });

  const addLinesFromGR = (grLines: OpenGRLine[]) => {
    setLines((rows) => {
      const existing = new Set(rows.map((r) => r.goods_receipt_line_id));
      const added = grLines
        .filter((gr) => !existing.has(gr.goods_receipt_line_id))
        .map((gr) => {
          const qty = gr.balance_qty;
          const total = qty * gr.unit_vat_inc;
          return {
            goods_receipt_line_id: gr.goods_receipt_line_id,
            label: `${gr.purchase_order_no} — ${gr.item_code} ${gr.item_name}`,
            qty: String(qty),
            unit_vat_inc: gr.unit_vat_inc,
            line_total: total.toFixed(4),
          };
        });
      return [...rows, ...added];
    });
  };

  const addLineFromGR = (gr: OpenGRLine) => addLinesFromGR([gr]);

  const save = async () => {
    if (!partnerId() || !currencyId()) {
      toast.warning("Select a vendor and currency.");
      return;
    }
    const bodyLines = lines()
      .filter((l) => l.goods_receipt_line_id && Number(l.qty) > 0)
      .map((l) => {
        const qty = Number(l.qty);
        const lineTotal = Number(l.line_total);
        const nonVat = lineTotal / 1.12;
        const tax = lineTotal - nonVat;
        return {
          goods_receipt_line_id: l.goods_receipt_line_id,
          qty,
          unit_non_vat: nonVat / qty,
          non_vat_total: nonVat,
          tax_amount: tax,
          unit_vat_inc: l.unit_vat_inc,
          line_total: lineTotal,
        };
      });
    if (bodyLines.length === 0) {
      toast.warning("Add at least one goods receipt line.");
      return;
    }

    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch<SupplierInvoiceDetail>(
          "/api/v1/finance/supplier-invoices",
          {
            method: "POST",
            body: JSON.stringify({
              invoice_date: invoiceDate(),
              partner_id: partnerId(),
              currency_id: currencyId(),
              vendor_invoice_no: vendorInvoiceNo().trim() || null,
              notes: notes().trim() || null,
              lines: bodyLines,
            }),
          },
          { silent: true },
        ),
      toast,
      "Supplier invoice created.",
    );
    setSaving(false);
    if (ok) props.onSaved();
  };

  return (
    <>
    <WideEntityModal
      open={props.open}
      title="New Supplier Invoice"
      onClose={props.onClose}
      onSave={() => void save()}
      saving={saving()}
      headerActions={
        <Show when={props.editingId}>
          <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </Show>
      }
    >
      <Field label="Invoice date">
        <DateInput value={invoiceDate()} onInput={(e) => setInvoiceDate(e.currentTarget.value)} />
      </Field>
      <Field label="Date-no / Invoice no">
        <input class={inputClass} readOnly value={`${dateNoDisplay()} / ${invoiceNo()}`} />
      </Field>
      <Field label="Vendor">
        <LookupCombo
          label=""
          value={vendorLabel}
          selectedId={() => partnerId()}
          onInput={setVendorLabel}
          onSelect={(o) => {
            setPartnerId(o.id);
            setVendorLabel(o.label);
            setLines([]);
          }}
          onClear={() => {
            setPartnerId(null);
            setVendorLabel("");
            setLines([]);
          }}
          fetchOptions={fetchVendors}
        />
      </Field>
      <Field label="Currency">
        <select class={inputClass} value={currencyId() ?? ""} onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}>
          <For each={currencies()}>{(c) => <option value={c.id}>{c.currency_code}</option>}</For>
        </select>
      </Field>
      <Field label="Vendor invoice no">
        <input class={inputClass} value={vendorInvoiceNo()} onInput={(e) => setVendorInvoiceNo(e.currentTarget.value)} />
      </Field>
      <div class="col-span-full">
        <Show when={partnerId()}>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-slate-700">Goods receipt lines</p>
            <button
              type="button"
              class="rounded border border-stroke px-3 py-1 text-xs text-brand-600 hover:bg-brand-50"
              onClick={() => setGrPickerOpen(true)}
            >
              Load Slip (from Goods Receipt)
            </button>
          </div>
          <div class="max-h-32 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
            <For each={openLines()}>
              {(gr) => (
                <button type="button" class="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100" onClick={() => addLineFromGR(gr)}>
                  {gr.purchase_order_no} — {gr.item_code} (balance {gr.balance_qty})
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div class="col-span-full">
        <Index each={lines()}>
          {(ln, i) => (
            <div class="mb-2 grid grid-cols-3 gap-2 text-sm">
              <span class="col-span-2 truncate">{ln().label}</span>
              <DecimalInput
                mode="qty"
                class={inputClass}
                value={ln().qty}
                onValue={(qty) => {
                  const total = String(roundMoney(parseNum(qty) * ln().unit_vat_inc));
                  setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, qty, line_total: total } : r)));
                }}
              />
            </div>
          )}
        </Index>
      </div>
      <Field label="Notes">
        <textarea class={`${inputClass} min-h-[60px]`} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>
    </WideEntityModal>
    <OpenGRLinePickerModal
      open={grPickerOpen()}
      partnerId={partnerId()}
      onClose={() => setGrPickerOpen(false)}
      onConfirm={(picked) => addLinesFromGR(picked)}
    />
    <HistoryLogModal
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      targetType="fin_supplier_invoice"
      targetId={props.editingId}
      title="History — Supplier Invoice"
    />
    </>
  );
}
