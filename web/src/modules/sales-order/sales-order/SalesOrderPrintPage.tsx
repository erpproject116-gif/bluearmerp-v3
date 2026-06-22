import { createEffect, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import {
  fetchSalesOrderPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type SalesOrderPrintPayload,
} from "./salesOrderPrint";
import { progressStatusLabel } from "./progressStatus";
import "../../quotation/quotation/quotationPrint.css";

function SalesOrderPrintView() {
  const params = useParams<{ salesOrderId: string }>();
  const [data] = createResource(
    () => Number(params.salesOrderId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid sales order id.");
      const res = await fetchSalesOrderPrint(id);
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

function PrintDocument(props: { payload: SalesOrderPrintPayload }) {
  const p = () => props.payload;
  const so = () => p().sales_order;
  const lines = () => so().lines ?? [];

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
          <h2>Sales Order</h2>
          <p class="quotation-print__meta">{so().sales_order_no}</p>
        </div>
      </header>

      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Sales Order Details</h3>
          <dl class="quotation-print__dl">
            <dt>Date-no</dt>
            <dd>{so().date_no_display}</dd>
            <dt>Date</dt>
            <dd>{formatPrintDate(so().order_date)}</dd>
            <dt>Transaction type</dt>
            <dd>{so().tax_type_name ?? "—"}</dd>
            <dt>Currency</dt>
            <dd>{so().currency_code ?? "—"}</dd>
            <dt>Location</dt>
            <dd>{so().location_name ?? "—"}</dd>
            <dt>PIC</dt>
            <dd>{so().pic_name || "—"}</dd>
            <dt>Progress</dt>
            <dd>{progressStatusLabel(so().progress_status)}</dd>
            <Show when={so().due_date}>
              <dt>Due date</dt>
              <dd>{formatPrintDate(so().due_date)}</dd>
            </Show>
            <Show when={so().delivery_date}>
              <dt>Delivery date</dt>
              <dd>{formatPrintDate(so().delivery_date)}</dd>
            </Show>
            <Show when={so().reference}>
              <dt>Reference</dt>
              <dd>{so().reference}</dd>
            </Show>
          </dl>
        </div>
        <div>
          <h3 class="quotation-print__section">Customer</h3>
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
      </section>

      <table class="quotation-print__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item Code</th>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit (Non-VAT)</th>
            <th class="num">Non-VAT Total</th>
            <th class="num">Tax</th>
            <th class="num">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {lines().length === 0 ? (
            <tr>
              <td colSpan={8}>No line items.</td>
            </tr>
          ) : (
            lines().map((ln) => (
              <tr>
                <td>{ln.line_no}</td>
                <td>{ln.item_code || "—"}</td>
                <td>
                  {ln.item_name}
                  {ln.description ? ` — ${ln.description}` : ""}
                </td>
                <td class="num">{ln.qty}</td>
                <td class="num">{formatMoney(ln.unit_non_vat)}</td>
                <td class="num">{formatMoney(ln.non_vat_total)}</td>
                <td class="num">{formatMoney(ln.tax_amount)}</td>
                <td class="num">{formatMoney(ln.line_total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div class="quotation-print__totals">
        <div class="quotation-print__totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(so().subtotal, so().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Tax</span>
          <span>{formatMoney(so().tax_total, so().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand Total</span>
          <span>{formatMoney(so().grand_total, so().currency_code)}</span>
        </div>
      </div>

      <Show when={so().payment_terms}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Payment Terms</h3>
          <p>{so().payment_terms}</p>
        </section>
      </Show>
      <Show when={so().delivery_remarks}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Delivery Remarks</h3>
          <p>{so().delivery_remarks}</p>
        </section>
      </Show>
      <Show when={so().notes}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Notes</h3>
          <p>{so().notes}</p>
        </section>
      </Show>

      <footer class="quotation-print__signatures">
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Prepared by</p>
        </div>
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Customer Acceptance</p>
        </div>
      </footer>

      <p class="quotation-print__footer">Generated from Bluearm ERP · {new Date().toLocaleString()}</p>
    </article>
  );
}

export function SalesOrderPrintPage() {
  return (
    <ProtectedRoute>
      <SalesOrderPrintView />
    </ProtectedRoute>
  );
}

export default SalesOrderPrintPage;
