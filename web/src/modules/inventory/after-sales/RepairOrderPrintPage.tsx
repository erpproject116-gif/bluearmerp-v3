import { createEffect, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
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

type Props = {
  doc: "receipt" | "warranty";
};

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

  createEffect(() => {
    if (!data()) return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  });

  return (
    <div class="repair-print">
      <Show when={data.loading}>
        <p class="repair-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="repair-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
      <div class="repair-print__toolbar no-print">
        <button type="button" class="repair-print__btn" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" class="repair-print__btn repair-print__btn--muted" onClick={() => window.close()}>
          Close
        </button>
      </div>
    </div>
  );
}

function PrintDocument(props: { payload: RepairOrderPrintPayload }) {
  const p = () => props.payload;
  const lines = () => p().order.lines ?? [];
  const total = () => orderLineTotal(lines());

  return (
    <article class="repair-print__page">
      <header class="repair-print__header">
        <div>
          <h1 class="repair-print__company">{p().tenant.company_name}</h1>
          <Show when={p().tenant.address}>
            <p class="repair-print__meta">{p().tenant.address}</p>
          </Show>
          <p class="repair-print__meta">{partyContact(p().tenant)}</p>
        </div>
        <div class="repair-print__doc-title">
          <h2>{p().doc_type === "receipt" ? "Repair Service Receipt" : "Repair Warranty Details"}</h2>
        </div>
      </header>

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

      <table class="repair-print__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item Code</th>
            <th>Description</th>
            <th>Serial / Lot</th>
            <th>Problem / Issue</th>
            <th class="num">Qty</th>
            <th class="num">Service Charge</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines().length === 0 ? (
            <tr>
              <td colSpan={8} class="repair-print__empty">
                No line items.
              </td>
            </tr>
          ) : (
            lines().map((ln) => (
              <tr>
                <td>{ln.line_no}</td>
                <td>{ln.item_code || "—"}</td>
                <td>{ln.item_name || "—"}</td>
                <td>{ln.serial_lot_no || "—"}</td>
                <td>{ln.problem_issue || "—"}</td>
                <td class="num">{ln.qty ?? 0}</td>
                <td class="num">{formatMoney(ln.service_charge ?? 0)}</td>
                <td class="num">{formatMoney(lineAmount(ln))}</td>
              </tr>
            ))
          )}
        </tbody>
        <Show when={p().doc_type === "receipt" && lines().length > 0}>
          <tfoot>
            <tr>
              <td colSpan={7} class="repair-print__total-label">
                Total Service Charge
              </td>
              <td class="num repair-print__total">{formatMoney(total())}</td>
            </tr>
          </tfoot>
        </Show>
      </table>

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

      <p class="repair-print__footer">Generated from Bluearm ERP · {new Date().toLocaleString()}</p>
    </article>
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
