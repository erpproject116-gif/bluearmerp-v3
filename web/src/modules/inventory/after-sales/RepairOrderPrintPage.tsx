import { createMemo, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintPreviewTable, type PrintPreviewColumn } from "../../../shared/PrintPreviewTable";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import { filterPrintRows, usePrintLayout } from "../../../shared/usePrintLayout";
import {
  fetchRepairOrderPrint,
  formatMoney,
  formatPrintDate,
  lineAmount,
  orderLineTotal,
  partyContact,
  type RepairOrderPrintPayload,
} from "./repairOrderPrint";
import "./repairOrderPrint.css";
import "../../quotation/quotation/quotationPrint.css";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";

type Props = { doc: "receipt" | "warranty" };

type RepairLine = NonNullable<RepairOrderPrintPayload["order"]["lines"]>[number];

const REPAIR_COLUMN_META = [
  { key: "line_no", label: "#" },
  { key: "item_code", label: "Item Code" },
  { key: "description", label: "Description" },
  { key: "serial_lot", label: "Serial / Lot" },
  { key: "problem_issue", label: "Problem / Issue" },
  { key: "qty", label: "Qty" },
  { key: "service_charge", label: "Service Charge" },
  { key: "amount", label: "Amount" },
];

function repairColumns(doc: "receipt" | "warranty"): PrintPreviewColumn<RepairLine>[] {
  const cols: PrintPreviewColumn<RepairLine>[] = [
    { key: "line_no", header: "#", width: 48, align: "center", render: (ln) => ln.line_no },
    { key: "item_code", header: "Item Code", width: 100, render: (ln) => ln.item_code || "—" },
    { key: "description", header: "Description", width: 160, render: (ln) => ln.item_name || "—" },
    { key: "serial_lot", header: "Serial / Lot", width: 120, render: (ln) => ln.serial_lot_no || "—" },
    { key: "problem_issue", header: "Problem / Issue", width: 160, render: (ln) => ln.problem_issue || "—" },
    { key: "qty", header: "Qty", width: 72, align: "right", render: (ln) => ln.qty ?? 0 },
    {
      key: "service_charge",
      header: "Service Charge",
      width: 110,
      align: "right",
      render: (ln) => formatMoney(ln.service_charge ?? 0),
    },
    {
      key: "amount",
      header: "Amount",
      width: 110,
      align: "right",
      render: (ln) => formatMoney(lineAmount(ln)),
    },
  ];
  if (doc === "receipt") return cols;
  return cols.filter((col) => col.key !== "service_charge" && col.key !== "amount");
}

function RepairOrderPrintView(props: Props) {
  const params = useParams<{ orderId: string }>();
  const [data] = createResource(
    () => ({ id: Number(params.orderId), doc: props.doc }),
    async ({ id, doc }) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid repair order id.");
      const res = await fetchRepairOrderPrint(id, doc);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  return (
    <div class="repair-print">
      <Show when={data.loading}>
        <p class="repair-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="repair-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: RepairOrderPrintPayload }) {
  const p = () => props.payload;
  const lines = () => p().order.lines ?? [];
  const columnMeta = () =>
    REPAIR_COLUMN_META.filter((c) => p().doc_type === "receipt" || !["service_charge", "amount"].includes(c.key));
  const layout = usePrintLayout(
    columnMeta,
    () =>
      lines().map((ln) => ({
        key: ln.line_no,
        label: `${ln.line_no}. ${ln.item_code || "—"} — ${ln.item_name || "Line"}`,
      })),
  );
  const visibleColumns = createMemo(() => {
    const keys = new Set(layout.visibleColumns().map((c) => c.key));
    return repairColumns(p().doc_type).filter((c) => keys.has(c.key));
  });
  const visibleLines = createMemo(() =>
    filterPrintRows(lines(), layout.visibleRowKeys(), (ln) => ln.line_no),
  );
  const total = () => orderLineTotal(visibleLines());

  return (
    <>
      <article class="repair-print__page">
        <PrintBrandingHeader
          variant="repair"
          docTitle={p().doc_type === "receipt" ? "Repair Service Receipt" : "Repair Warranty Details"}
          tenantFallbackName={p().tenant.company_name}
        />

        <section class="repair-print__grid">
          <div>
            <h3 class="repair-print__section">Order</h3>
            <dl class="repair-print__dl">
              <dt>Date-no</dt>
              <dd>{p().order.date_no_display}</dd>
              <dt>Repair Order No.</dt>
              <dd>{p().order.repair_order_no}</dd>
              <dt>Order Date</dt>
              <dd>{formatPrintDate(p().order.order_date)}</dd>
              <dt>Location</dt>
              <dd>{p().order.location_name ?? "—"}</dd>
              <dt>PIC</dt>
              <dd>{p().order.pic_name || "—"}</dd>
              <Show when={p().order.technician_name}>
                <dt>Technician</dt>
                <dd>{p().order.technician_name}</dd>
              </Show>
              <dt>Progress</dt>
              <dd>{p().order.progress_status === "finished" ? "Finished" : "Received"}</dd>
              <Show when={p().order.scheduled_completion_date}>
                <dt>Repair Date</dt>
                <dd>{formatPrintDate(p().order.scheduled_completion_date)}</dd>
              </Show>
            </dl>
          </div>
          <div>
            <h3 class="repair-print__section">Customer</h3>
            <dl class="repair-print__dl">
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
        </section>

        <PrintPreviewTable class="mb-4" emptyMessage="No line items." columns={visibleColumns()} rows={visibleLines()} />

        <Show when={p().doc_type === "receipt" && visibleLines().length > 0}>
          <div class="repair-print__totals">
            <div class="repair-print__totals-row">
              <span>Total Service Charge</span>
              <span>{formatMoney(total())}</span>
            </div>
          </div>
        </Show>

        <Show when={p().order.repair_details}>
          <section class="repair-print__notes">
            <h3 class="repair-print__section">Repair Details</h3>
            <p>{p().order.repair_details}</p>
          </section>
        </Show>

        <Show when={p().order.latest_update}>
          <section class="repair-print__notes">
            <h3 class="repair-print__section">Latest Update</h3>
            <p>{p().order.latest_update}</p>
          </section>
        </Show>

        <Show when={p().doc_type === "warranty"}>
          <section class="repair-print__terms">
            <h3 class="repair-print__section">Warranty Terms</h3>
            <p>
              Warranty coverage applies to the repair work performed on the items listed above, subject to normal use
              and excluding damage from misuse, accident, or unauthorized modification. Present this document with the
              repair order number for warranty service inquiries.
            </p>
          </section>
        </Show>

        <footer class="repair-print__signatures">
          <div class="repair-print__sig">
            <div class="repair-print__sig-line" />
            <p>{p().doc_type === "receipt" ? "Customer Signature" : "Customer Acknowledgment"}</p>
          </div>
          <div class="repair-print__sig">
            <div class="repair-print__sig-line" />
            <p>{p().doc_type === "receipt" ? "Received By" : "Authorized Representative"}</p>
          </div>
        </footer>

        <PrintBrandingFooter
          class="repair-print__footer"
          defaultFooter={`Generated from Bluearm ERP · ${new Date().toLocaleString()}`}
        />
      </article>

      <PrintToolbar
        layout={{
          columns: columnMeta(),
          rows: lines().map((ln) => ({
            key: ln.line_no,
            label: `${ln.line_no}. ${ln.item_code || "—"} — ${ln.item_name || "Line"}`,
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

function withDoc(doc: Props["doc"]) {
  return function Page() {
    return (
      <ProtectedRoute>
        <RepairOrderPrintView doc={doc} />
      </ProtectedRoute>
    );
  };
}

export const RepairOrderReceiptPrintPage = withDoc("receipt");
export const RepairOrderWarrantyPrintPage = withDoc("warranty");
