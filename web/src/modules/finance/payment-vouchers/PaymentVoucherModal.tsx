import { createEffect, createSignal, For, Index, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { DecimalInput } from "../../../shared/DecimalInput";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { formatMoney } from "../../../shared/money";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../../shared/entityTypes";
import { useToast } from "../../../shared/toast";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import type { PaymentVoucherDetail } from "../../../shared/usePaymentVoucherList";

type AppRow = {
  supplier_invoice_id: number | null;
  label: string;
  grand_total: number;
  applied_amount: string;
};

type WhtRow = {
  tax_code_id: number | null;
  code: string;
  rate_pct: number;
  base_amount: string;
};

type WithholdingCode = {
  id: number;
  code: string;
  description: string;
  rate_pct: number;
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
  const auth = useAuth();
  const [saving, setSaving] = createSignal(false);
  const [showNewVendor, setShowNewVendor] = createSignal(false);
  const [newVendorName, setNewVendorName] = createSignal("");
  const [paymentDate, setPaymentDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [paymentNo, setPaymentNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [paymentMethod, setPaymentMethod] = createSignal("bank_transfer");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [bankAccountId, setBankAccountId] = createSignal<number | null>(null);
  const [applications, setApplications] = createSignal<AppRow[]>([{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);
  const [withholdingLines, setWithholdingLines] = createSignal<WhtRow[]>([]);

  const whtCodes = createQuery(() => ({
    queryKey: ["withholding-codes-pv"],
    queryFn: async () => {
      const res = await apiFetch<WithholdingCode[]>("/api/v1/finance/withholding-codes");
      if (!res.success) throw new Error(res.message ?? "Failed to load withholding codes");
      return res.data ?? [];
    },
    enabled: props.open,
  }));

  const bankAccounts = createQuery(() => ({
    queryKey: ["bank-accounts-pv"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; bank_account_name: string }[]>(
        "/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc",
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load bank accounts");
      return res.data ?? [];
    },
    enabled: props.open,
  }));

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
    setBankAccountId(null);
    setWithholdingLines([]);
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

  const totalWithheld = () =>
    withholdingLines().reduce((sum, row) => {
      const base = Number(row.base_amount) || 0;
      return sum + base * (row.rate_pct / 100);
    }, 0);

  const totalApplied = () =>
    applications().reduce((sum, a) => sum + (Number(a.applied_amount) || 0), 0);

  const buildDraftPayload = () => ({
    payment_date: paymentDate(),
    partner_id: partnerId(),
    vendor_label: vendorLabel(),
    currency_id: currencyId(),
    payment_method: paymentMethod(),
    reference_no: referenceNo(),
    bank_account_id: bankAccountId(),
    applications: applications(),
    withholding_lines: withholdingLines(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setPaymentDate(payload.payment_date);
    setPartnerId(payload.partner_id);
    setVendorLabel(payload.vendor_label);
    setCurrencyId(payload.currency_id);
    setPaymentMethod(payload.payment_method);
    setReferenceNo(payload.reference_no);
    setBankAccountId(payload.bank_account_id);
    setApplications(payload.applications?.length ? payload.applications : [{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);
    setWithholdingLines(payload.withholding_lines ?? []);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.finPaymentVoucher,
    draftKey: "new",
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // No autoApply: the reset effect below async-fetches a default currency, which can resolve
    // after draft recovery and stomp currency_id.
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
    const wht = withholdingLines()
      .filter((w) => w.tax_code_id && Number(w.base_amount) > 0)
      .map((w) => ({ tax_code_id: w.tax_code_id!, base_amount: Number(w.base_amount) }));
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
              bank_account_id: bankAccountId() || null,
              applications: apps,
              withholding_lines: wht,
            }),
          },
          { silent: true },
        ),
      toast,
      "Payment voucher created.",
    );
    setSaving(false);
    if (ok) {
      await draft.clearOnSave();
      props.onSaved();
    }
  };

  const addWhtLine = () => {
    const codes = whtCodes.data ?? [];
    const first = codes[0];
    setWithholdingLines((rows) => [
      ...rows,
      { tax_code_id: first?.id ?? null, code: first?.code ?? "", rate_pct: first?.rate_pct ?? 0, base_amount: "" },
    ]);
  };

  return (
    <>
    <WideEntityModal open={props.open} title="New Payment Voucher" onClose={props.onClose} onSave={() => void save()} saving={saving()}>
      <ModalFormGuide guideId="payment_voucher" />
      <draft.DraftBanner />
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
          createLabel="Add vendor"
          onCreate={
            hasPermission(auth.me, "inventory.partners", "write")
              ? (q) => {
                  setNewVendorName(q);
                  setShowNewVendor(true);
                }
              : undefined
          }
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
      <Show when={paymentMethod() === "check"}>
        <Field label="Bank account (check register)">
          <select class={inputClass} value={bankAccountId() ?? ""} onChange={(e) => setBankAccountId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
            <option value="">Select bank account…</option>
            {(bankAccounts.data ?? []).map((b) => (
              <option value={String(b.id)}>{b.bank_account_name}</option>
            ))}
          </select>
        </Field>
      </Show>
      <Field label="Reference / check no.">
        <input class={inputClass} value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
      </Field>
      <div class="col-span-full space-y-2">
        <p class="text-sm font-medium text-text-primary">Invoice applications</p>
        <Index each={applications()}>
          {(app, index) => (
            <div class="grid grid-cols-2 gap-2">
              <LookupCombo
                label="Supplier invoice"
                value={() => app()?.label ?? ""}
                selectedId={() => app()?.supplier_invoice_id ?? null}
                onInput={(t) =>
                  setApplications((rows) => rows.map((r, idx) => (idx === index ? { ...r, label: t } : r)))
                }
                onSelect={(o) =>
                  setApplications((rows) =>
                    rows.map((r, idx) =>
                      idx === index
                        ? { ...r, supplier_invoice_id: o.id, label: o.label, grand_total: Number(o.sublabel ?? 0) }
                        : r,
                    ),
                  )
                }
                onClear={() =>
                  setApplications((rows) =>
                    rows.map((r, idx) =>
                      idx === index
                        ? { supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: r.applied_amount }
                        : r,
                    ),
                  )
                }
                fetchOptions={() => (partnerId() ? fetchInvoicesForVendor(partnerId()!) : Promise.resolve([]))}
              />
              <Field label="Applied amount">
                <DecimalInput
                  class={inputClass}
                  value={app()?.applied_amount ?? ""}
                  onValue={(v) =>
                    setApplications((rows) => rows.map((r, idx) => (idx === index ? { ...r, applied_amount: v } : r)))
                  }
                />
              </Field>
            </div>
          )}
        </Index>
        <button type="button" class="text-sm text-brand-600" onClick={() => setApplications((rows) => [...rows, { supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }])}>
          + Add application
        </button>
      </div>

      <div class="col-span-full space-y-2 border-t border-stroke pt-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-text-primary">Withholding tax (2307)</p>
          <button type="button" class="text-sm text-brand-600" onClick={addWhtLine}>
            + Add withholding line
          </button>
        </div>
        <For each={withholdingLines()}>
          {(_, index) => (
            <div class="grid grid-cols-3 gap-2">
              <Field label="Tax code">
                <select
                  class={inputClass}
                  value={withholdingLines()[index()]?.tax_code_id ?? ""}
                  onChange={(e) => {
                    const id = Number(e.currentTarget.value);
                    const code = (whtCodes.data ?? []).find((c) => c.id === id);
                    setWithholdingLines((rows) =>
                      rows.map((r, idx) =>
                        idx === index()
                          ? { ...r, tax_code_id: id || null, code: code?.code ?? "", rate_pct: code?.rate_pct ?? 0 }
                          : r,
                      ),
                    );
                  }}
                >
                  <option value="">Select code…</option>
                  {(whtCodes.data ?? []).map((c) => (
                    <option value={String(c.id)}>
                      {c.code} — {c.description} ({c.rate_pct}%)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Income base amount">
                <DecimalInput
                  class={inputClass}
                  value={withholdingLines()[index()]?.base_amount ?? ""}
                  onValue={(v) =>
                    setWithholdingLines((rows) => rows.map((r, idx) => (idx === index() ? { ...r, base_amount: v } : r)))
                  }
                />
              </Field>
              <Field label="Tax withheld">
                <input
                  class={inputClass}
                  readOnly
                  value={(() => {
                    const row = withholdingLines()[index()];
                    if (!row) return "";
                    const base = Number(row.base_amount) || 0;
                    return formatMoney(base * (row.rate_pct / 100));
                  })()}
                />
              </Field>
            </div>
          )}
        </For>
        <Show when={withholdingLines().length > 0}>
          <p class="text-sm text-text-secondary">
            Applied: {formatMoney(totalApplied())} · Withheld:{" "}
            {formatMoney(totalWithheld())} · Net payment:{" "}
            {formatMoney(totalApplied() - totalWithheld())}
          </p>
        </Show>
      </div>
    </WideEntityModal>
    <QuickCustomerModal
      open={showNewVendor()}
      partnerKind="vendor"
      initialName={newVendorName()}
      onClose={() => setShowNewVendor(false)}
      onCreated={(p) => {
        setPartnerId(p.id);
        setVendorLabel(p.company_name);
        setApplications([{ supplier_invoice_id: null, label: "", grand_total: 0, applied_amount: "" }]);
      }}
    />
    </>
  );
}
