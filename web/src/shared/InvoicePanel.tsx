import { Show, createEffect, createSignal } from "solid-js";
import { inputClass, Field } from "./SpreadsheetGrid";
import { LookupCombo } from "./LookupCombo";
import { AttachmentsField } from "./AttachmentsField";
import type { AttachmentScope } from "./attachments";
import { fetchAccountOptions } from "./accounts";
import { formatPeso, bindDecimalInput } from "./money";
import { useToast } from "./toast";
import {
  getPurchaseInvoice,
  getSalesInvoice,
  savePurchaseInvoice,
  saveSalesInvoice,
  type PurchaseInvoice,
  type SalesInvoice,
} from "./invoiceApi";

type Kind = "sales" | "purchase";

type Props = {
  kind: Kind;
  docId?: number;
  attachmentsScope: AttachmentScope;
  onPrint?: () => void;
  onSaved?: () => void;
};

const CONFIG: Record<Kind, { acctIType: string; acctILabel: string; acctIILabel: string; defaultAcctI: string; defaultAcctII: string; partyLabel: string }> = {
  sales: {
    acctIType: "income",
    acctILabel: "Sales account (Acct I)",
    acctIILabel: "Deposit account (Acct II)",
    defaultAcctI: "4019",
    defaultAcctII: "1089",
    partyLabel: "Customer",
  },
  purchase: {
    acctIType: "expense",
    acctILabel: "Account for purchase (Acct I)",
    acctIILabel: "Withdrawal account (Acct II)",
    defaultAcctI: "1469",
    defaultAcctII: "2519",
    partyLabel: "Vendor",
  },
};

/**
 * Accounting invoice for a Sale or Purchase: pretax/tax/total (read-only from the
 * transaction), Acct I (revenue/expense) and Acct II (AR/AP or cash/bank) pickers,
 * fees, remark, carried attachments, a link to the generated draft journal entry,
 * and print. Saving (re)builds the draft journal entry server-side.
 */
export function InvoicePanel(props: Props) {
  const toast = useToast();
  const cfg = () => CONFIG[props.kind];

  const [pretax, setPretax] = createSignal(0);
  const [tax, setTax] = createSignal(0);
  const [grand, setGrand] = createSignal(0);
  const [partner, setPartner] = createSignal("");
  const [docNo, setDocNo] = createSignal("");
  const [docDate, setDocDate] = createSignal("");
  const [taxType, setTaxType] = createSignal("");

  const [acctILabel, setAcctILabel] = createSignal("");
  const [acctIId, setAcctIId] = createSignal<number | null>(null);
  const [acctIILabel, setAcctIILabel] = createSignal("");
  const [acctIIId, setAcctIIId] = createSignal<number | null>(null);
  const [fees, setFees] = createSignal("0");
  const [remark, setRemark] = createSignal("");
  const [jeNo, setJeNo] = createSignal("");
  const [jeStatus, setJeStatus] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const prefill = async (code: string, setLabel: (s: string) => void, setId: (n: number | null) => void) => {
    const opts = await fetchAccountOptions(code);
    const match = opts.find((o) => o.label.startsWith(`[${code}]`));
    if (match) {
      setLabel(match.label);
      setId(match.id);
    }
  };

  const load = async () => {
    const id = props.docId;
    if (!id) return;
    if (props.kind === "sales") {
      const res = await getSalesInvoice(id);
      if (!res.success || !res.data) return;
      const d: SalesInvoice = res.data;
      setPretax(d.pretax_amount); setTax(d.tax); setGrand(d.grand_total);
      setPartner(d.partner_name); setDocNo(d.sales_no); setDocDate(d.order_date); setTaxType(d.tax_type_name);
      setFees(String(d.fees ?? 0)); setRemark(d.remark ?? "");
      setAcctILabel(d.sales_account ?? ""); setAcctIId(d.sales_account_id);
      setAcctIILabel(d.deposit_account ?? ""); setAcctIIId(d.deposit_account_id);
      setJeNo(d.journal_entry_no ?? ""); setJeStatus(d.journal_status ?? "");
    } else {
      const res = await getPurchaseInvoice(id);
      if (!res.success || !res.data) return;
      const d: PurchaseInvoice = res.data;
      setPretax(d.pretax_amount); setTax(d.tax); setGrand(d.grand_total);
      setPartner(d.partner_name); setDocNo(d.invoice_no); setDocDate(d.invoice_date); setTaxType("");
      setFees(String(d.fees ?? 0)); setRemark(d.remark ?? "");
      setAcctILabel(d.purchase_account ?? ""); setAcctIId(d.purchase_account_id);
      setAcctIILabel(d.withdrawal_account ?? ""); setAcctIIId(d.withdrawal_account_id);
      setJeNo(d.journal_entry_no ?? ""); setJeStatus(d.journal_status ?? "");
    }
    // Suggest frequently-used defaults on first open.
    if (!acctIId()) void prefill(cfg().defaultAcctI, setAcctILabel, setAcctIId);
    if (!acctIIId()) void prefill(cfg().defaultAcctII, setAcctIILabel, setAcctIIId);
  };

  createEffect(() => {
    void props.docId;
    void load();
  });

  const save = async () => {
    const id = props.docId;
    if (!id) return;
    if (!acctIId() || !acctIIId()) {
      toast.warning("Please choose both accounts.");
      return;
    }
    setSaving(true);
    const feeNum = Number(fees()) || 0;
    const res =
      props.kind === "sales"
        ? await saveSalesInvoice(id, { sales_account_id: acctIId()!, deposit_account_id: acctIIId()!, fees: feeNum, remark: remark() })
        : await savePurchaseInvoice(id, { purchase_account_id: acctIId()!, withdrawal_account_id: acctIIId()!, fees: feeNum, remark: remark() });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save invoice.");
      return;
    }
    toast.success("Invoice saved.");
    void load();
    props.onSaved?.();
  };

  return (
    <Show when={props.docId} fallback={<p class="text-sm text-text-secondary">Save the transaction first to prepare its invoice.</p>}>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3 rounded-lg border border-stroke bg-slate-50 p-4 text-sm md:grid-cols-3">
          <div><div class="text-text-secondary">Date</div><div class="font-medium">{docDate()}</div></div>
          <div><div class="text-text-secondary">No.</div><div class="font-medium">{docNo()}</div></div>
          <div><div class="text-text-secondary">{cfg().partyLabel}</div><div class="font-medium">{partner()}</div></div>
          <Show when={taxType()}><div><div class="text-text-secondary">Tax type</div><div class="font-medium">{taxType()}</div></div></Show>
          <div><div class="text-text-secondary">Pretax amount</div><div class="font-medium">{formatPeso(pretax())}</div></div>
          <div><div class="text-text-secondary">Tax</div><div class="font-medium">{formatPeso(tax())}</div></div>
          <div><div class="text-text-secondary">Grand total</div><div class="font-semibold">{formatPeso(grand())}</div></div>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LookupCombo
            label={cfg().acctILabel}
            value={acctILabel}
            selectedId={acctIId}
            onInput={setAcctILabel}
            onSelect={(o) => { setAcctIId(o.id); setAcctILabel(o.label); }}
            onClear={() => { setAcctIId(null); setAcctILabel(""); }}
            fetchOptions={(q) => fetchAccountOptions(q, cfg().acctIType)}
            placeholder="Search account…"
            required
          />
          <LookupCombo
            label={cfg().acctIILabel}
            value={acctIILabel}
            selectedId={acctIIId}
            onInput={setAcctIILabel}
            onSelect={(o) => { setAcctIIId(o.id); setAcctIILabel(o.label); }}
            onClear={() => { setAcctIIId(null); setAcctIILabel(""); }}
            fetchOptions={(q) => fetchAccountOptions(q)}
            placeholder="Search account…"
            required
          />
          <Field label="Fees">
            <input class={inputClass} inputmode="decimal" value={fees()} onInput={(e) => bindDecimalInput(e.currentTarget, setFees)} />
          </Field>
          <Field label="Remark">
            <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
          </Field>
        </div>

        <Show when={jeNo()}>
          <div class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm">
            Journal entry: <span class="font-medium">{jeNo()}</span>
            <span class={`ml-2 rounded px-2 py-0.5 text-xs ${jeStatus() === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{jeStatus()}</span>
          </div>
        </Show>

        <AttachmentsField scope={props.attachmentsScope} docId={props.docId} label="Attachments (from previous documents)" />

        <div class="flex justify-end gap-2">
          <Show when={props.onPrint}>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => props.onPrint?.()}>
              Print invoice
            </button>
          </Show>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void save()}>
            {saving() ? "Saving…" : "Save invoice"}
          </button>
        </div>
      </div>
    </Show>
  );
}
