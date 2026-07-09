import { createResource, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import { fetchRfqPrint, formatPrintDate } from "./rfqPrint";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";

function RfqPrintView() {
  const params = useParams<{ rfqId: string }>();
  const [data] = createResource(
    () => Number(params.rfqId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid RFQ id.");
      const res = await fetchRfqPrint(id);
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
      <Show when={data()}>
        {(payload) => {
          const rfq = () => payload().rfq;
          return (
            <>
              <article class="quotation-print__page">
                <PrintBrandingHeader docTitle="Request for Quotation" docSubtitle={rfq().rfq_no} tenantFallbackName={payload().tenant.company_name} />
                <dl class="quotation-print__dl">
                  <dt>RFQ date</dt>
                  <dd>{formatPrintDate(rfq().rfq_date)}</dd>
                  <dt>Status</dt>
                  <dd>{rfq().status}</dd>
                </dl>
                <table class="quotation-print__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rfq().lines ?? []}>
                      {(ln) => (
                        <tr>
                          <td>{ln.line_no}</td>
                          <td>
                            {ln.item_code} — {ln.item_name}
                          </td>
                          <td>{ln.qty}</td>
                          <td>{ln.notes ?? ""}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <Show when={rfq().notes}>
                  <section class="quotation-print__notes">
                    <h3 class="quotation-print__section">Notes</h3>
                    <p>{rfq().notes}</p>
                  </section>
                </Show>
                <PrintBrandingFooter />
              </article>
              <PrintToolbar onPrint={() => window.print()} />
            </>
          );
        }}
      </Show>
    </div>
  );
}

export default function RfqPrintPage() {
  return (
    <ProtectedRoute>
      <RfqPrintView />
    </ProtectedRoute>
  );
}
