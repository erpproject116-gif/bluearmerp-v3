import { createEffect, createSignal, For } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import type { PaymentVoucherDetail } from "../../../shared/usePaymentVoucherList";

type AppRow = {
  supplier_invoice_id: number | null;
  label: string;
  grand_total: number;
  applied_amount: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
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

async function fetchInvoicesForVendor(partnerId: number): Promise<LookupOption[]> {
  const res = await apiFetch<{ id: number; partner_id: number; invoice_no: string; date_no_display: string; grand_total: number }[]>(
    `/api/v1/finance/supplier-invoices?page=1&pageSize=100&sort=invoice_date&order=desc`,
  );
  return (res.data ?? [])
    .filter((s) => s.partner_id === partnerId)
    .map((s) => ({ id: s.id, label: `${s.date_no_display} — ${s.invoice_no}`, sublabel: String(s.grand_total) }));
}

export function PaymentVoucherModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [paymentDate, setPaymentDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [paymentNo, setPaymentNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [paymentMethod, setPaymentMethod] = createSignal("bank_transfer");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [applications, setApplications] = createSignal<AppRow[]>([{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; payment_no: string }>(
      `/api/v1/finance/payment-vouchers/preview-sequences?payment_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setPaymentNo(res.data.payment_no);
    }
  };

  createEffect(() => {
    if (!props.open) return;
    setPaymentDate(todayISO());
    setPartnerId(null);
    setVendorLabel("");
    setReferenceNo("");
    setApplications([{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);
    void loadPreview(todayISO());
    void apiFetch<{ id: number; is_default: boolean }[]>("/api/v1/quotation/currencies?page=1&pageSize=100&status=active").then((res) => {
      const def = (res.data ?? []).find((c) => c.is_default) ?? res.data?.[0];
      if (def) setCurrencyId(def.id);
    });
  });

  createEffect(() => {
    if (!props.open) return;
    void loadPreview(paymentDate());
  });

  const save = async () => {
    if (!partnerId() || !currencyId()) {
      toast.warning("Select vendor and currency.");
      return;
    }
    const apps = applications()
      .filter((a) => a.supplier_invoice_id && Number(a.applied_amount) > 0)
      .map((a) => ({ supplier_invoice_id: a.supplier_invoice_id!, applied_amount: Number(a.applied_amount) }));
    if (apps.length === 0) {
      toast.warning("Add at least one invoice application.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch<PaymentVoucherDetail>(
          "/api/v1/finance/payment-vouchers",
          {
            method: "POST",
            body: JSON.stringify({
              payment_date: paymentDate(),
              partner_id: partnerId(),
              currency_id: currencyId(),
              payment_method: paymentMethod(),
              reference_no: referenceNo().trim() || null,
              applications: apps,
            }),
          },
          { silent: true },
        ),
      toast,
      "Payment voucher created.",
    );
    setSaving(false);
    if (ok) props.onSaved();
  };

  return (
    <WideEntityModal open={props.open} title="New Payment Voucher" onClose={props.onClose} onSave={() => void save()} saving={saving()}>
      <Field label="Payment date">
        <DateInput value={paymentDate()} onInput={(e) => setPaymentDate(e.currentTarget.value)} />
      </Field>
      <Field label="Date-no / Payment no">
        <input class={inputClass} readOnly value={`${dateNoDisplay()} / ${paymentNo()}`} />
      </Field>
      <Field label="Vendor">
        <LookupCombo
          label=""
          value={vendorLabel}
          selectedId={partnerId}
          onInput={setVendorLabel}
          onSelect={(o) => {
            setPartnerId(o.id);
            setVendorLabel(o.label);
            setApplications([{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);
          }}
          onClear={() => {
            setPartnerId(null);
            setVendorLabel("");
          }}
          fetchOptions={fetchVendors}
        />
      </Field>
      <Field label="Currency">
        <input class={inputClass} readOnly value={currencyId() ?? ""} />
      </Field>
      <Field label="Payment method">
        <select class={inputClass} value={paymentMethod()} onChange={(e) => setPaymentMethod(e.currentTarget.value)}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>
      </Field>
      <Field label="Reference">
        <input class={inputClass} value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
      </Field>
      <div class="col-span-full space-y-2">
        <For each={applications()}>
          {(_, index) => (
            <div class="grid grid-cols-2 gap-2">
              <LookupCombo
                label="Supplier invoice"
                value={() => applications()[index()]?.label ?? ""}
                selectedId={() => applications()[index()]?.supplier_invoice_id ?? null}
                onInput={(t) =>
                  setApplications((rows) => rows.map((r, idx) => (idx === index() ? { ...r, label: t } : r)))
                }
                onSelect={(o) =>
                  setApplications((rows) =>
                    rows.map((r, idx) =>
                      idx === index()
                        ? { ...r, supplier_invoice_id: o.id, label: o.label, grand_total: Number(o.sublabel ?? 0) }
                        : r,
                    ),
                  )
                }
                onClear={() =>
                  setApplications((rows) =>
                    rows.map((r, idx) =>
                      idx === index()
                        ? { supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: r.applied_amount }
                        : r,
                    ),
                  )
                }
                fetchOptions={() => (partnerId() ? fetchInvoicesForVendor(partnerId()!) : Promise.resolve([]))}
              />
              <Field label="Applied amount">
                <input
                  class={inputClass}
                  type="number"
                  step="any"
                  value={applications()[index()]?.applied_amount ?? ""}
                  onInput={(e) =>
                    setApplications((rows) => rows.map((r, idx) => (idx === index() ? { ...r, applied_amount: e.currentTarget.value } : r)))
                  }
                />
              </Field>
            </div>
          )}
        </For>
        <button type="button" class="text-sm text-brand-600" onClick={() => setApplications((rows) => [...rows, { supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }])}>
          + Add application
        </button>
      </div>
    </WideEntityModal>
  );
}
