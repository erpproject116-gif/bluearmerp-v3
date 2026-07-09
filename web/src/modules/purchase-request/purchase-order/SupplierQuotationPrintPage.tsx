import { createResource, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import {
  fetchSupplierQuotationPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
} from "./supplierQuotationPrint";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";
import { PrintLoading } from "../../../shared/LoadingText";

function SupplierQuotationPrintView() {
  const params = useParams<{ sqId: string }>();
  const [data] = createResource(
    () => Number(params.sqId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid supplier quotation id.");
      const res = await fetchSupplierQuotationPrint(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <PrintLoading />
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => {
          const sq = () => payload().supplier_quotation;
          return (
            <>
              <article class="quotation-print__page">
                <PrintBrandingHeader
                  docTitle="Supplier Quotation"
                  docSubtitle={sq().quote_no}
                  tenantFallbackName={payload().tenant.company_name}
                />
                <section class="quotation-print__grid">
                  <div>
                    <dl class="quotation-print__dl">
                      <dt>Quote date</dt>
                      <dd>{formatPrintDate(sq().quote_date)}</dd>
                      <dt>Valid until</dt>
                      <dd>{formatPrintDate(sq().valid_until)}</dd>
                      <dt>Status</dt>
                      <dd>{sq().status}</dd>
                    </dl>
                  </div>
                  <div>
                    <h3 class="quotation-print__section">Vendor</h3>
                    <p class="quotation-print__party-name">{payload().partner.company_name}</p>
                    <p class="quotation-print__party-line">{partyContact(payload().partner)}</p>
                  </div>
                </section>
                <table class="quotation-print__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={sq().lines ?? []}>
                      {(ln) => (
                        <tr>
                          <td>{ln.line_no}</td>
                          <td>
                            {ln.item_code} — {ln.item_name}
                          </td>
                          <td>{ln.qty}</td>
                          <td>{formatMoney(ln.unit_price)}</td>
                          <td>{formatMoney(ln.line_total)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <div class="quotation-print__totals">
                  <div class="quotation-print__totals-row">
                    <span>Grand Total</span>
                    <span>{formatMoney(sq().grand_total)}</span>
                  </div>
                </div>
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

export default function SupplierQuotationPrintPage() {
  return (
    <ProtectedRoute>
      <SupplierQuotationPrintView />
    </ProtectedRoute>
  );
}
