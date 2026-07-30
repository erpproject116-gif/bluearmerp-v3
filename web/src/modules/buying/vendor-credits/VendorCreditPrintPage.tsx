import { createResource, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintLoading } from "../../../shared/LoadingText";
import {
  fetchVendorCreditPrint,
  formatMoney,
  formatPrintDate,
  type VendorCreditPrintPayload,
} from "./vendorCreditPrint";
import "../../quotation/quotation/quotationPrint.css";

function VendorCreditPrintView() {
  const params = useParams<{ id: string }>();
  const [data] = createResource(
    () => Number(params.id),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid vendor credit id.");
      const res = await fetchVendorCreditPrint(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  return (
    <div class="quotation-print">
      <PrintToolbar onPrint={() => window.print()} />
      <Show when={data.loading}>
        <PrintLoading />
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: VendorCreditPrintPayload }) {
  const vc = () => props.payload.vendor_credit;
  return (
    <>
      <article class="quotation-print__page">
        <PrintBrandingHeader
          docTitle="Vendor Credit"
          docSubtitle={vc().credit_no}
          tenantFallbackName={props.payload.tenant.company_name}
        />
        <section class="quotation-print__grid">
          <div>
            <dl class="quotation-print__dl">
              <dt>Credit date</dt>
              <dd>{formatPrintDate(vc().credit_date)}</dd>
              <dt>Status</dt>
              <dd class="capitalize">{vc().status}</dd>
              <dt>Reason</dt>
              <dd>{vc().reason || "—"}</dd>
            </dl>
          </div>
          <div>
            <dl class="quotation-print__dl">
              <dt>Vendor</dt>
              <dd>{props.payload.partner.company_name || vc().vendor_name}</dd>
            </dl>
          </div>
        </section>
        <table class="quotation-print__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit price</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <For each={vc().lines ?? []}>
              {(ln) => (
                <tr>
                  <td>{ln.line_no}</td>
                  <td>
                    {ln.item_code ? `${ln.item_code} — ` : ""}
                    {ln.item_name || "—"}
                  </td>
                  <td class="text-right">{ln.qty ?? 0}</td>
                  <td class="text-right">{formatMoney(ln.unit_price ?? 0)}</td>
                  <td class="text-right">{formatMoney(ln.tax_amount ?? 0)}</td>
                  <td class="text-right">{formatMoney(ln.amount ?? 0)}</td>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} class="text-right font-semibold">
                Total
              </td>
              <td class="text-right font-semibold">{formatMoney(vc().amount_total)}</td>
            </tr>
          </tfoot>
        </table>
        <Show when={vc().notes}>
          <p class="mt-4 text-sm text-slate-600">{vc().notes}</p>
        </Show>
        <PrintBrandingFooter />
      </article>
    </>
  );
}

export default function VendorCreditPrintPage() {
  return (
    <ProtectedRoute>
      <VendorCreditPrintView />
    </ProtectedRoute>
  );
}
