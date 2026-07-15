import { Show, createEffect, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { inputClass, Field } from "./SpreadsheetGrid";
import { LookupCombo } from "./LookupCombo";
import { AttachmentsField } from "./AttachmentsField";
import { InvoiceLineItemsTable } from "./InvoiceLineItemsTable";
import type { AttachmentScope } from "./attachments";
import type { DocumentLineRow } from "./documentLinePrint";
import { fetchAccountOptions } from "./accounts";
import { apiFetch } from "./api";
import { formatPeso, bindDecimalInput } from "./money";
import { useToast } from "./toast";
import {
  savePurchaseInvoice,
  saveSalesInvoice,
  type PurchaseInvoice,
  type SalesInvoice,
} from "./invoiceApi";
import { loadInvoiceDocumentPrint, type InvoiceDocumentKind } from "./invoiceDocumentPrint";
import { docProgressStatusLabel } from "./docProgressStatusTabs";
import { SalesApprovalPanel } from "../modules/sales/sales/SalesApprovalPanel";
import { SupplierInvoiceApprovalPanel } from "../modules/finance/supplier-invoices/SupplierInvoiceApprovalPanel";

type Kind = InvoiceDocumentKind;

type Props = {
  kind: Kind;
  docId?: number;
  attachmentsScope: AttachmentScope;
  /** Document progress (unconfirmed / e_approval / completed) for review on this tab. */
  progressStatus?: string;
  /** Pass modal open so staged attachments reset correctly. */
  formOpen?: boolean;
  onPrint?: () => void;
  onSaved?: () => void;
  onApprovalChanged?: () => void;
};

const CONFIG: Record<Kind, { acctIType: string; acctILabel: string; acctIILabel: string; defaultAcctI: string; defaultAcctII: string; partyLabel: string }> = {
  sales: {
    acctIType: "income",
    acctILabel: "Sales revenue (Acct I)",
    acctIILabel: "Deposit account (Acct II)",
    defaultAcctI: "4019",
    defaultAcctII: "1089",
    partyLabel: "Customer",
  },
  purchase: {
    acctIType: "expense",
    acctILabel: "Purchases / COGS (Acct I)",
    acctIILabel: "Withdrawal account (Acct II)",
    // Must be an expense account (e.g. 5010 Cost of Goods Sold). Never inventory asset 1469 —
    // the Acct I picker is filtered to expense only.
    defaultAcctI: "5010",
    defaultAcctII: "2519",
    partyLabel: "Vendor",
  },
};

/**
 * Accounting invoice for a Sale or Purchase: line breakdown, pretax/tax/total,
 * Acct I (revenue/expense) and Acct II (AR/AP or cash/bank) pickers, fees,
 * remark, carried attachments, journal entry link, and print.
 */
export function InvoicePanel(props: Props) {
  const toast = useToast();
  const cfg = () => CONFIG[props.kind];

  const [loading, setLoading] = createSignal(false);
  const [lines, setLines] = createSignal<DocumentLineRow[]>([]);
  const [currencyCode, setCurrencyCode] = createSignal<string | undefined>();
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
  const [jeId, setJeId] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [purchaseCogsHint, setPurchaseCogsHint] = createSignal(false);
  const [ensuringPurchaseCogs, setEnsuringPurchaseCogs] = createSignal(false);

  const accountsLocked = () => jeStatus() === "posted";
  const invoiceSaved = () => Boolean(acctIId() && acctIIId());

  const applyVoucher = (kind: Kind, voucher: SalesInvoice | PurchaseInvoice) => {
    setPretax(voucher.pretax_amount);
    setTax(voucher.tax);
    setGrand(voucher.grand_total);
    setFees(String(voucher.fees ?? 0));
    setRemark(voucher.remark ?? "");
    setJeNo(voucher.journal_entry_no ?? "");
    setJeStatus(voucher.journal_status ?? "");
    setJeId(voucher.journal_entry_id ?? null);
    if (kind === "sales") {
      const v = voucher as SalesInvoice;
      setPartner(v.partner_name);
      setDocNo(v.sales_no);
      setDocDate(v.order_date);
      setTaxType(v.tax_type_name);
      setAcctILabel(v.sales_account ?? "");
      setAcctIId(v.sales_account_id);
      setAcctIILabel(v.deposit_account ?? "");
      setAcctIIId(v.deposit_account_id);
    } else {
      const v = voucher as PurchaseInvoice;
      setPartner(v.partner_name);
      setDocNo(v.invoice_no);
      setDocDate(v.invoice_date);
      setTaxType("");
      setAcctILabel(v.purchase_account ?? "");
      setAcctIId(v.purchase_account_id);
      setAcctIILabel(v.withdrawal_account ?? "");
      setAcctIIId(v.withdrawal_account_id);
    }
  };

  const prefill = async (code: string, setLabel: (s: string) => void, setId: (n: number | null) => void) => {
    const opts = await fetchAccountOptions(code);
    const match = opts.find((o) => o.label.startsWith(`[${code}]`));
    if (match) {
      setLabel(match.label);
      setId(match.id);
      return true;
    }
    return false;
  };

  const prefillFromDefaults = async (kind: Kind) => {
    const res = await apiFetch<{
      sales_account_id?: number | null;
      purchase_account_id?: number | null;
    }>("/api/v1/finance/accounts/defaults", {}, { silent: true });
    if (!res.success || !res.data) return false;
    const id = kind === "sales" ? res.data.sales_account_id : res.data.purchase_account_id;
    if (!id) return false;
    const params = new URLSearchParams({
      page: "1",
      pageSize: "200",
      status: "active",
      sort: "account_code",
      order: "asc",
      account_type: cfg().acctIType,
    });
    const list = await apiFetch<{ id: number; account_code: string; account_name: string }[]>(
      `/api/v1/finance/accounts?${params}`,
      {},
      { silent: true },
    );
    const found = (list.data ?? []).find((a) => a.id === id);
    if (!found) return false;
    setAcctILabel(`[${found.account_code}] ${found.account_name}`);
    setAcctIId(found.id);
    return true;
  };

  const ensurePurchaseCogsAccount = async () => {
    setEnsuringPurchaseCogs(true);
    const res = await apiFetch<{
      account: { id: number; account_code: string; account_name: string };
    }>("/api/v1/finance/accounts/ensure-purchase-cogs", { method: "POST" });
    setEnsuringPurchaseCogs(false);
    if (!res.success || !res.data?.account) {
      toast.warning(res.message ?? "Could not create Purchases / COGS account.");
      return;
    }
    const a = res.data.account;
    setAcctIId(a.id);
    setAcctILabel(`[${a.account_code}] ${a.account_name}`);
    setPurchaseCogsHint(false);
    toast.success("Purchases / COGS account ready.");
  };

  const load = async () => {
    const id = props.docId;
    if (!id) return;
    setLoading(true);
    setPurchaseCogsHint(false);
    try {
      const data = await loadInvoiceDocumentPrint(props.kind, id, { includeAttachments: false });
      setLines(data.lines);
      setCurrencyCode(data.currencyCode);
      applyVoucher(props.kind, data.voucher);
      const voucher = data.voucher;
      if (props.kind === "sales") {
        const v = voucher as SalesInvoice;
        if (!v.sales_account_id) {
          const fromDefaults = await prefillFromDefaults("sales");
          if (!fromDefaults) void prefill(cfg().defaultAcctI, setAcctILabel, setAcctIId);
        }
        if (!v.deposit_account_id) void prefill(cfg().defaultAcctII, setAcctIILabel, setAcctIIId);
      } else {
        const v = voucher as PurchaseInvoice;
        if (!v.purchase_account_id) {
          const fromDefaults = await prefillFromDefaults("purchase");
          if (!fromDefaults) {
            const ok = await prefill(cfg().defaultAcctI, setAcctILabel, setAcctIId);
            if (!ok) {
              const expenseOpts = await fetchAccountOptions("", "expense");
              setPurchaseCogsHint(expenseOpts.length === 0);
            }
          }
        }
        if (!v.withdrawal_account_id) void prefill(cfg().defaultAcctII, setAcctIILabel, setAcctIIId);
      }
    } catch (err) {
      toast.warning(err instanceof Error ? err.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    void props.docId;
    void props.kind;
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
        <Show when={loading()}>
          <p class="text-sm text-text-secondary">Loading invoice…</p>
        </Show>

        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-stroke bg-white px-4 py-3 text-sm">
          <Show when={props.progressStatus}>
            <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              Document: {docProgressStatusLabel(props.progressStatus!)}
            </span>
          </Show>
          <Show when={invoiceSaved()} fallback={<span class="text-xs text-amber-700">Accounting invoice not saved yet — choose accounts and save.</span>}>
            <span class="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Accounting invoice saved</span>
          </Show>
          <Show when={jeNo()}>
            <span class="text-text-secondary">
              Journal: <span class="font-medium text-text-primary">{jeNo()}</span>
              <Show when={jeStatus()}>
                <span class={`ml-2 rounded px-2 py-0.5 text-xs ${jeStatus() === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {jeStatus()}
                </span>
              </Show>
            </span>
          </Show>
        </div>

        <Show when={accountsLocked()}>
          <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The linked journal entry is posted. You can still update fees and remark here; to change accounts, adjust the entry under Finance → Journal entries
            <Show when={jeId()}> (entry #{jeId()})</Show>.
          </p>
        </Show>

        <Show when={props.docId && props.progressStatus}>
          <Show when={props.kind === "sales"}>
            <SalesApprovalPanel
              salesId={props.docId!}
              progressStatus={props.progressStatus!}
              compact
              onChanged={() => {
                props.onApprovalChanged?.();
                void load();
              }}
            />
          </Show>
          <Show when={props.kind === "purchase"}>
            <SupplierInvoiceApprovalPanel
              supplierInvoiceId={props.docId!}
              progressStatus={props.progressStatus!}
              compact
              onChanged={() => {
                props.onApprovalChanged?.();
                void load();
              }}
            />
          </Show>
        </Show>

        <div class="grid grid-cols-2 gap-3 rounded-lg border border-stroke bg-slate-50 p-4 text-sm md:grid-cols-3">
          <div><div class="text-text-secondary">Date</div><div class="font-medium">{docDate()}</div></div>
          <div><div class="text-text-secondary">No.</div><div class="font-medium">{docNo()}</div></div>
          <div><div class="text-text-secondary">{cfg().partyLabel}</div><div class="font-medium">{partner()}</div></div>
          <Show when={taxType()}><div><div class="text-text-secondary">Tax type</div><div class="font-medium">{taxType()}</div></div></Show>
          <div><div class="text-text-secondary">Pretax amount</div><div class="font-medium">{formatPeso(pretax())}</div></div>
          <div><div class="text-text-secondary">Tax</div><div class="font-medium">{formatPeso(tax())}</div></div>
          <div><div class="text-text-secondary">Grand total</div><div class="font-semibold">{formatPeso(grand())}</div></div>
        </div>

        <InvoiceLineItemsTable
          lines={lines()}
          currencyCode={currencyCode()}
          useDocumentCurrency={props.kind === "sales"}
        />

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <LookupCombo
              label={cfg().acctILabel}
              value={acctILabel}
              selectedId={acctIId}
              onInput={setAcctILabel}
              onSelect={(o) => { setAcctIId(o.id); setAcctILabel(o.label); setPurchaseCogsHint(false); }}
              onClear={() => { setAcctIId(null); setAcctILabel(""); }}
              fetchOptions={(q) => fetchAccountOptions(q, cfg().acctIType)}
              placeholder={props.kind === "purchase" ? "Search expense / COGS…" : "Search account…"}
              required
              disabled={accountsLocked()}
            />
            <Show when={props.kind === "purchase" && purchaseCogsHint() && !accountsLocked()}>
              <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p class="font-medium">No Purchases / COGS expense account found</p>
                <p class="mt-0.5 text-amber-900/80">
                  Map it under Finance → Acct. I → Chart of Accounts → Default account mappings → Purchases / COGS
                  (usually 5010 Cost of Goods Sold).
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-md bg-amber-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                    disabled={ensuringPurchaseCogs()}
                    onClick={() => void ensurePurchaseCogsAccount()}
                  >
                    {ensuringPurchaseCogs() ? "Creating…" : "Create Purchases / COGS (5010)"}
                  </button>
                  <A
                    href="/app/finance/acct-i/chart-of-accounts?focus=purchase#default-account-mappings"
                    class="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Open account mappings
                  </A>
                </div>
              </div>
            </Show>
            <Show when={props.kind === "purchase" && !purchaseCogsHint() && !acctIId() && !accountsLocked()}>
              <p class="text-xs text-slate-500">
                Prefer the mapped Purchases / COGS default (5010).{" "}
                <A href="/app/finance/acct-i/chart-of-accounts?focus=purchase#default-account-mappings" class="underline">
                  Review mappings
                </A>
              </p>
            </Show>
          </div>
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
            disabled={accountsLocked()}
          />
          <Field label="Fees">
            <input class={inputClass} inputmode="decimal" value={fees()} onInput={(e) => bindDecimalInput(e.currentTarget, setFees)} />
          </Field>
          <Field label="Remark">
            <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
          </Field>
        </div>

        <Show when={jeNo() && !accountsLocked()}>
          <div class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm">
            Draft journal entry ready for review in Finance after you save.
          </div>
        </Show>

        <Show when={jeNo() && accountsLocked()}>
          <div class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm">
            Journal entry: <span class="font-medium">{jeNo()}</span>
            <span class={`ml-2 rounded px-2 py-0.5 text-xs ${jeStatus() === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{jeStatus()}</span>
          </div>
        </Show>

        <AttachmentsField
          scope={props.attachmentsScope}
          docId={props.docId}
          formOpen={props.formOpen ?? true}
          label="Attachments (from previous documents)"
        />

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
