import { createMemo, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintPreviewTable, type PrintPreviewColumn } from "../../../shared/PrintPreviewTable";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import { filterPrintRows, usePrintLayout } from "../../../shared/usePrintLayout";
import {
  fetchSalesPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type SalesPrintPayload,
} from "./salesPrint";
import type { SalesDetail } from "./SalesModal";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";

type LineRow = NonNullable<SalesDetail["lines"]>[number];

const PACKING_COLUMN_META = [
  { key: "item_name", label: "Item Name" },
  { key: "qty", label: "Qty" },
  { key: "serial_lot", label: "Serial/Lot No." },
  { key: "price", label: "Price (Tax Included)" },
];

function packingColumns(): PrintPreviewColumn<LineRow>[] {
  return [
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
    { key: "qty", header: "Qty", width: 80, align: "right", render: (ln) => ln.qty },
    { key: "serial_lot", header: "Serial/Lot No.", width: 160, render: (ln) => ln.serial_lot_no ?? "—" },
    {
      key: "price",
      header: "Price (Tax Included)",
      width: 140,
      align: "right",
      render: (ln) => formatMoney(ln.unit_vat_inc),
    },
  ];
}

function lineKey(ln: LineRow, index: number) {
  return ln.line_no ?? index + 1;
}

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

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: SalesPrintPayload }) {
  const p = () => props.payload;
  const sale = () => p().sales;
  const lines = () => (sale().lines ?? []) as LineRow[];
  const receiptNo = () => sale().si_dr_no || sale().sales_no;
  const layout = usePrintLayout(
    () => PACKING_COLUMN_META,
    () =>
      lines().map((ln, index) => ({
        key: lineKey(ln, index),
        label: `${lineKey(ln, index)}. ${ln.item_name || "Line"}`,
      })),
  );
  const visibleColumns = createMemo(() => {
    const keys = new Set(layout.visibleColumns().map((c) => c.key));
    return packingColumns().filter((c) => keys.has(c.key));
  });
  const visibleLines = createMemo(() =>
    filterPrintRows(lines(), layout.visibleRowKeys(), (ln, index) => lineKey(ln, index)),
  );
  const totalQty = () => visibleLines().reduce((sum, ln) => sum + (ln.qty ?? 0), 0);
  const grandTotal = () => sale().grand_total ?? 0;

  return (
    <>
      <article class="quotation-print__page">
        <PrintBrandingHeader
          docTitle="PACKING SLIP"
          tenantFallbackName={p().tenant.company_name}
        />

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

        <PrintPreviewTable class="mb-4" emptyMessage="No line items." columns={visibleColumns()} rows={visibleLines()} />

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

        <PrintBrandingFooter
          class="quotation-print__footer"
          defaultFooter={`Generated from Bluearm ERP · ${new Date().toLocaleString()}`}
        />
      </article>

      <PrintToolbar
        layout={{
          columns: PACKING_COLUMN_META,
          rows: lines().map((ln, index) => ({
            key: lineKey(ln, index),
            label: `${lineKey(ln, index)}. ${ln.item_name || "Line"}`,
          })),
          hiddenColumns: layout.hiddenColumns,
          hiddenRows: layout.hiddenRows,
          onToggleColumn: layout.toggleColumn,
          onToggleRow: layout.toggleRow,
          onShowAll: layout.showAll,
        }}
        onPrint={() => window.print()}
        onClose={() => window.close()}
      />
    </>
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
