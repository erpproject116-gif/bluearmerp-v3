import { For, Show, createResource } from "solid-js";
import {
  DocumentLinePrintTable,
  useDocumentLinePrintLayout,
} from "./documentLinePrint";
import { formatPeso } from "./money";
import { PrintToolbar } from "./PrintToolbar";
import { PrintBrandingHeader } from "./branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "./branding/PrintBrandingFooter";
import {
  loadInvoiceDocumentPrint,
  type InvoiceDocumentKind,
  type InvoiceDocumentPrintData,
} from "./invoiceDocumentPrint";
import type { PurchaseInvoice, SalesInvoice } from "./invoiceApi";
import { formatMoney, formatPrintDate } from "../modules/sales/sales/salesPrint";
import "../modules/quotation/quotation/quotationPrint.css";

function formatAmount(kind: InvoiceDocumentKind, amount: number, currencyCode?: string) {
  return kind === "sales" ? formatMoney(amount, currencyCode) : formatPeso(amount);
}

function AccountingBlock(props: { data: InvoiceDocumentPrintData }) {
  const d = () => props.data;
  const v = () => d().voucher;
  const isSales = () => d().kind === "sales";

  const salesVoucher = () => v() as SalesInvoice;
  const purchaseVoucher = () => v() as PurchaseInvoice;

  return (
    <section class="mt-8 border-t border-slate-300 pt-6">
      <h2 class="quotation-print__section mb-3">Accounting voucher</h2>
      <div class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
        <div>
          <span class="text-slate-600">Journal entry: </span>
          <span class="font-medium">{v().journal_entry_no || "—"}</span>
          <Show when={v().journal_status}>
            <span class="ml-2 text-slate-500">{v().journal_status}</span>
          </Show>
        </div>
        <Show when={isSales() && salesVoucher().tax_type_name}>
          <div>
            <span class="text-slate-600">Tax type: </span>
            <span class="font-medium">{salesVoucher().tax_type_name}</span>
          </div>
        </Show>
        <div>
          <span class="text-slate-600">{isSales() ? "Sales account (Acct I): " : "Account for purchase (Acct I): "}</span>
          <span class="font-medium">
            {isSales() ? salesVoucher().sales_account : purchaseVoucher().purchase_account || "—"}
          </span>
        </div>
        <div>
          <span class="text-slate-600">{isSales() ? "Deposit account (Acct II): " : "Withdrawal account (Acct II): "}</span>
          <span class="font-medium">
            {isSales() ? salesVoucher().deposit_account : purchaseVoucher().withdrawal_account || "—"}
          </span>
        </div>
        <div>
          <span class="text-slate-600">Fees: </span>
          <span class="font-medium">{formatAmount(d().kind, v().fees ?? 0, d().currencyCode)}</span>
        </div>
        <Show when={v().remark}>
          <div class="md:col-span-2">
            <span class="text-slate-600">Remark: </span>
            <span>{v().remark}</span>
          </div>
        </Show>
      </div>
      <Show when={d().attachments.length > 0}>
        <div class="mt-4 text-sm">
          <div class="mb-1 font-semibold">Attachments</div>
          <ul class="list-disc pl-5 text-slate-700">
            <For each={d().attachments}>{(a) => <li>{a.file_name}</li>}</For>
          </ul>
        </div>
      </Show>
    </section>
  );
}

function InvoiceDocumentArticle(props: { data: InvoiceDocumentPrintData }) {
  const d = () => props.data;
  const layout = useDocumentLinePrintLayout();
  const money = (amount: number) => formatAmount(d().kind, amount, d().currencyCode);

  return (
    <article class="quotation-print__page">
      <PrintBrandingHeader docTitle={d().title} docSubtitle={d().docNo} />
      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">{d().partyLabel}</h3>
          <p class="quotation-print__party-name">{d().partyName}</p>
          <Show when={d().partyContact}>
            <p class="quotation-print__party-line">{d().partyContact}</p>
          </Show>
        </div>
        <div>
          <dl class="quotation-print__dl">
            <Show when={d().dateNoDisplay}>
              <dt>Date-no</dt>
              <dd>{d().dateNoDisplay}</dd>
            </Show>
            <dt>{d().kind === "sales" ? "Invoice date" : "Purchase date"}</dt>
            <dd>{formatPrintDate(d().docDate)}</dd>
            <Show when={d().taxTypeName}>
              <dt>Transaction type</dt>
              <dd>{d().taxTypeName}</dd>
            </Show>
            <Show when={d().currencyCode}>
              <dt>Currency</dt>
              <dd>{d().currencyCode}</dd>
            </Show>
            <Show when={d().progressStatus}>
              <dt>Progress</dt>
              <dd>{d().progressStatus}</dd>
            </Show>
          </dl>
        </div>
      </section>

      <DocumentLinePrintTable lines={() => d().lines} formatMoney={money} layout={layout} />

      <div class="quotation-print__totals">
        <div class="quotation-print__totals-row">
          <span>Pretax amount</span>
          <span>{money(d().pretax)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Tax</span>
          <span>{money(d().tax)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand total</span>
          <span>{money(d().grand)}</span>
        </div>
      </div>

      <AccountingBlock data={d()} />
      <PrintBrandingFooter />
    </article>
  );
}

export function InvoiceDocumentPrintView(props: { kind: InvoiceDocumentKind; docId: () => number }) {
  const [data] = createResource(
    props.docId,
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid document id.");
      return loadInvoiceDocumentPrint(props.kind, id);
    },
  );

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <InvoiceDocumentArticle data={payload()} />}</Show>
      <PrintToolbar onPrint={() => window.print()} onClose={() => window.close()} />
    </div>
  );
}
