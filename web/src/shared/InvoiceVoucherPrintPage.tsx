import { For, Show, createResource } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "./ProtectedRoute";
import { formatPeso } from "./money";
import { getPurchaseInvoice, getSalesInvoice } from "./invoiceApi";
import { listAttachments, type Attachment, type AttachmentScope } from "./attachments";

type Kind = "sales" | "purchase";

type VoucherData = {
  title: string;
  no: string;
  date: string;
  partyLabel: string;
  party: string;
  pretax: number;
  tax: number;
  grand: number;
  fees: number;
  remark: string;
  acctILabel: string;
  acctI: string;
  acctIILabel: string;
  acctII: string;
  jeNo: string;
  jeStatus: string;
  attachments: Attachment[];
};

async function loadVoucher(kind: Kind, id: number): Promise<VoucherData> {
  const scope: AttachmentScope = kind === "sales" ? "sales" : "finance/supplier-invoices";
  const att = await listAttachments(scope, id);
  const attachments = att.success && att.data ? att.data : [];
  if (kind === "sales") {
    const res = await getSalesInvoice(id);
    if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load invoice.");
    const d = res.data;
    return {
      title: "Sales Invoice",
      no: d.sales_no,
      date: d.order_date,
      partyLabel: "Customer",
      party: d.partner_name,
      pretax: d.pretax_amount,
      tax: d.tax,
      grand: d.grand_total,
      fees: d.fees,
      remark: d.remark,
      acctILabel: "Sales account",
      acctI: d.sales_account,
      acctIILabel: "Deposit account",
      acctII: d.deposit_account,
      jeNo: d.journal_entry_no,
      jeStatus: d.journal_status,
      attachments,
    };
  }
  const res = await getPurchaseInvoice(id);
  if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load invoice.");
  const d = res.data;
  return {
    title: "Purchase Invoice",
    no: d.invoice_no,
    date: d.invoice_date,
    partyLabel: "Vendor",
    party: d.partner_name,
    pretax: d.pretax_amount,
    tax: d.tax,
    grand: d.grand_total,
    fees: d.fees,
    remark: d.remark,
    acctILabel: "Account for purchase",
    acctI: d.purchase_account,
    acctIILabel: "Withdrawal account",
    acctII: d.withdrawal_account,
    jeNo: d.journal_entry_no,
    jeStatus: d.journal_status,
    attachments,
  };
}

function InvoiceVoucherView(kind: Kind) {
  const params = useParams<{ id: string }>();
  const [data] = createResource(
    () => Number(params.id),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid id.");
      return loadVoucher(kind, id);
    },
  );

  return (
    <div class="mx-auto max-w-3xl p-6 text-sm text-slate-900">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div class="no-print mb-4 flex gap-2">
        <button type="button" class="rounded bg-brand-600 px-4 py-2 text-white" onClick={() => window.print()}>Print</button>
        <button type="button" class="rounded border border-stroke px-4 py-2" onClick={() => window.close()}>Close</button>
      </div>
      <Show when={data.loading}><p>Loading…</p></Show>
      <Show when={data.error}><p class="text-red-600">{String(data.error)}</p></Show>
      <Show when={data()}>
        {(d) => (
          <div class="rounded-lg border border-slate-300 p-6">
            <div class="mb-4 flex items-center justify-between border-b border-slate-300 pb-3">
              <h1 class="text-xl font-bold">{d().title}</h1>
              <div class="text-right">
                <div class="font-semibold">{d().no}</div>
                <div class="text-slate-600">{d().date}</div>
              </div>
            </div>
            <div class="mb-4 grid grid-cols-2 gap-2">
              <div><span class="text-slate-600">{d().partyLabel}: </span><span class="font-medium">{d().party}</span></div>
              <div><span class="text-slate-600">Journal entry: </span><span class="font-medium">{d().jeNo || "—"}</span> <span class="text-slate-500">{d().jeStatus}</span></div>
              <div><span class="text-slate-600">{d().acctILabel} (Acct I): </span><span class="font-medium">{d().acctI || "—"}</span></div>
              <div><span class="text-slate-600">{d().acctIILabel} (Acct II): </span><span class="font-medium">{d().acctII || "—"}</span></div>
            </div>
            <table class="mb-4 w-full border-collapse">
              <tbody>
                <tr class="border-b border-slate-200"><td class="py-1 text-slate-600">Pretax amount</td><td class="py-1 text-right">{formatPeso(d().pretax)}</td></tr>
                <tr class="border-b border-slate-200"><td class="py-1 text-slate-600">Tax</td><td class="py-1 text-right">{formatPeso(d().tax)}</td></tr>
                <tr class="border-b border-slate-200"><td class="py-1 text-slate-600">Fees</td><td class="py-1 text-right">{formatPeso(d().fees)}</td></tr>
                <tr><td class="py-2 font-semibold">Grand total</td><td class="py-2 text-right font-semibold">{formatPeso(d().grand)}</td></tr>
              </tbody>
            </table>
            <Show when={d().remark}>
              <p class="mb-4"><span class="text-slate-600">Remark: </span>{d().remark}</p>
            </Show>
            <Show when={d().attachments.length > 0}>
              <div>
                <div class="mb-1 font-semibold">Attachments</div>
                <ul class="list-disc pl-5">
                  <For each={d().attachments}>{(a) => <li>{a.file_name}</li>}</For>
                </ul>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

export function SalesInvoicePrintPage() {
  return (
    <ProtectedRoute>
      {InvoiceVoucherView("sales")}
    </ProtectedRoute>
  );
}

export function PurchaseInvoicePrintPage() {
  return (
    <ProtectedRoute>
      {InvoiceVoucherView("purchase")}
    </ProtectedRoute>
  );
}
