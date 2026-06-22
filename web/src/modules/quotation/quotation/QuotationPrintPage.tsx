import { createEffect, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintPreviewTable } from "../../../shared/PrintPreviewTable";
import {
  fetchQuotationPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type QuotationPrintPayload,
} from "./quotationPrint";
import { progressStatusLabel } from "./progressStatus";
import "./quotationPrint.css";

function QuotationPrintView() {
  const params = useParams<{ quotationId: string }>();
  const [data] = createResource(
    () => Number(params.quotationId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid quotation id.");
      const res = await fetchQuotationPrint(id);
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

function PrintDocument(props: { payload: QuotationPrintPayload }) {
  const p = () => props.payload;
  const q = () => p().quotation;
  const lines = () => q().lines ?? [];

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
          <h2>Quotation</h2>
          <p class="quotation-print__meta">{q().reference_no}</p>
        </div>
      </header>

      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Quotation Details</h3>
          <dl class="quotation-print__dl">
            <dt>Date-no</dt>
            <dd>{q().date_no_display}</dd>
            <dt>Date</dt>
            <dd>{formatPrintDate(q().order_date)}</dd>
            <dt>Transaction type</dt>
            <dd>{q().tax_type_name ?? "—"}</dd>
            <dt>Currency</dt>
            <dd>{q().currency_code ?? "—"}</dd>
            <dt>Location</dt>
            <dd>{q().location_name ?? "—"}</dd>
            <dt>PIC</dt>
            <dd>{q().pic_name || "—"}</dd>
            <dt>Progress</dt>
            <dd>{progressStatusLabel(q().progress_status)}</dd>
            <Show when={q().valid_until}>
              <dt>Valid until</dt>
              <dd>{formatPrintDate(q().valid_until)}</dd>
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

      <PrintPreviewTable
        class="mb-4"
        emptyMessage="No line items."
        columns={[
          { key: "line_no", header: "#", width: 48, align: "center", render: (ln) => ln.line_no },
          { key: "item_code", header: "Item Code", width: 100, render: (ln) => ln.item_code || "—" },
          {
            key: "description",
            header: "Description",
            width: 240,
            render: (ln) => (
              <>
                {ln.item_name}
                {ln.description ? ` — ${ln.description}` : ""}
              </>
            ),
          },
          { key: "qty", header: "Qty", width: 72, align: "right", render: (ln) => ln.qty },
          { key: "unit_non_vat", header: "Unit (Non-VAT)", width: 110, align: "right", render: (ln) => formatMoney(ln.unit_non_vat) },
          { key: "non_vat_total", header: "Non-VAT Total", width: 110, align: "right", render: (ln) => formatMoney(ln.non_vat_total) },
          { key: "tax_amount", header: "Tax", width: 90, align: "right", render: (ln) => formatMoney(ln.tax_amount) },
          { key: "line_total", header: "Line Total", width: 110, align: "right", render: (ln) => formatMoney(ln.line_total) },
        ]}
        rows={lines()}
      />

      <div class="quotation-print__totals">
        <div class="quotation-print__totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(q().subtotal, q().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Tax</span>
          <span>{formatMoney(q().tax_total, q().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand Total</span>
          <span>{formatMoney(q().grand_total, q().currency_code)}</span>
        </div>
      </div>

      <Show when={q().payment_terms}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Payment Terms</h3>
          <p>{q().payment_terms}</p>
        </section>
      </Show>
      <Show when={q().notes}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Notes</h3>
          <p>{q().notes}</p>
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

export function QuotationPrintPage() {
  return (
    <ProtectedRoute>
      <QuotationPrintView />
    </ProtectedRoute>
  );
}

export default QuotationPrintPage;
