import { createEffect, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintPreviewTable } from "../../../shared/PrintPreviewTable";
import {
  fetchSalesPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type SalesPrintPayload,
} from "./salesPrint";
import type { SalesDetail } from "./SalesModal";
import "../../quotation/quotation/quotationPrint.css";

type LineRow = NonNullable<SalesDetail["lines"]>[number];

function PackingSlipPrintView() {
  const params = useParams<{ id: string }>();
  const [data] = createResource(
    () => Number(params.id),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid sales id.");
      const res = await fetchSalesPrint(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  createEffect(() => {
    if (!data()) return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  });

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
      <div class="quotation-print__toolbar no-print">
        <p class="text-xs text-text-secondary mb-2">Drag column edges to resize before printing.</p>
        <button type="button" class="quotation-print__btn" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" class="quotation-print__btn quotation-print__btn--muted" onClick={() => window.close()}>
          Close
        </button>
      </div>
    </div>
  );
}

function PrintDocument(props: { payload: SalesPrintPayload }) {
  const p = () => props.payload;
  const sale = () => p().sales;
  const lines = () => (sale().lines ?? []) as LineRow[];
  const receiptNo = () => sale().si_dr_no || sale().sales_no;
  const totalQty = () => lines().reduce((sum, ln) => sum + (ln.qty ?? 0), 0);
  const grandTotal = () => sale().grand_total ?? 0;

  return (
    <article class="quotation-print__page">
      <header class="quotation-print__header">
        <div>
          <h1 class="quotation-print__company">{p().tenant.company_name}</h1>
          <Show when={p().tenant.address}>
            <p class="quotation-print__meta">{p().tenant.address}</p>
          </Show>
          <p class="quotation-print__meta">{partyContact(p().tenant)}</p>
        </div>
        <div class="quotation-print__doc-title">
          <h2>PACKING SLIP</h2>
        </div>
      </header>

      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Bill To</h3>
          <dl class="quotation-print__dl">
            <dt>Name</dt>
            <dd>{p().partner.company_name}</dd>
            <Show when={p().partner.address}>
              <dt>Address</dt>
              <dd>{p().partner.address}</dd>
            </Show>
            <dt>Contact</dt>
            <dd>{partyContact(p().partner)}</dd>
          </dl>
        </div>
        <div>
          <h3 class="quotation-print__section">Receipt Details</h3>
          <dl class="quotation-print__dl">
            <dt>Receipt No.</dt>
            <dd>{receiptNo()}</dd>
            <dt>Invoice Date</dt>
            <dd>{formatPrintDate(sale().order_date)}</dd>
            <Show when={sale().due_date}>
              <dt>Due Date</dt>
              <dd>{formatPrintDate(sale().due_date)}</dd>
            </Show>
            <dt>PIC</dt>
            <dd>{sale().pic_name || "—"}</dd>
            <dt>Date-No.</dt>
            <dd>{sale().date_no_display}</dd>
          </dl>
        </div>
      </section>

      <PrintPreviewTable<LineRow>
        class="mb-4"
        emptyMessage="No line items."
        columns={[
          {
            key: "item_name",
            header: "Item Name",
            width: 280,
            render: (ln) => (
              <>
                {ln.item_name}
                {ln.description ? ` — ${ln.description}` : ""}
              </>
            ),
          },
          {
            key: "qty",
            header: "Qty",
            width: 80,
            align: "right",
            render: (ln) => ln.qty,
          },
          {
            key: "serial_lot",
            header: "Serial/Lot No.",
            width: 160,
            render: (ln) => ln.serial_lot_no ?? "—",
          },
          {
            key: "price",
            header: "Price (Tax Included)",
            width: 140,
            align: "right",
            render: (ln) => formatMoney(ln.unit_vat_inc),
          },
        ]}
        rows={lines()}
      />

      <div class="quotation-print__totals">
        <div class="quotation-print__totals-row">
          <span>Total Qty</span>
          <span>{totalQty()}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand Total</span>
          <span>{formatMoney(grandTotal(), sale().currency_code)}</span>
        </div>
      </div>

      <footer class="quotation-print__signatures">
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Prepared by</p>
        </div>
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Received by</p>
        </div>
      </footer>

      <p class="quotation-print__footer">Generated from Bluearm ERP · {new Date().toLocaleString()}</p>
    </article>
  );
}

export function PackingSlipPrintPage() {
  return (
    <ProtectedRoute>
      <PackingSlipPrintView />
    </ProtectedRoute>
  );
}

export default PackingSlipPrintPage;
