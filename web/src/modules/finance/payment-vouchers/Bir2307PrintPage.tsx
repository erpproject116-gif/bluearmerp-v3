import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { fetchBir2307Print, formatMoney, formatPrintDate, type Bir2307PrintPayload } from "./bir2307Print";
import "../../quotation/quotation/quotationPrint.css";
import { PrintLoading } from "../../../shared/LoadingText";

function Bir2307PrintView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data] = createResource(
    () => Number(params.id),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid payment voucher id.");
      const res = await fetchBir2307Print(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load BIR 2307 data.");
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
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} onClose={() => navigate(-1)} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: Bir2307PrintPayload; onClose: () => void }) {
  const p = () => props.payload;

  return (
    <>
      <PrintToolbar onPrint={() => window.print()} onClose={props.onClose} />
      <article class="quotation-print__page">
        <PrintBrandingHeader docTitle="BIR Form 2307" docSubtitle="Certificate of Creditable Tax Withheld at Source" tenantFallbackName={p().payor.company_name} />

        <section class="quotation-print__grid mt-6">
          <div>
            <h3 class="quotation-print__section">Payor (Withholding Agent)</h3>
            <dl class="quotation-print__dl">
              <dt>Name</dt>
              <dd>{p().payor.company_name}</dd>
              <dt>TIN</dt>
              <dd>{p().payor.tin ?? "—"}</dd>
              <dt>Address</dt>
              <dd>{p().payor.address ?? "—"}</dd>
            </dl>
          </div>
          <div>
            <h3 class="quotation-print__section">Payee (Vendor)</h3>
            <dl class="quotation-print__dl">
              <dt>Name</dt>
              <dd>{p().payee.company_name}</dd>
              <dt>TIN</dt>
              <dd>{p().payee.tin ?? "—"}</dd>
              <dt>Address</dt>
              <dd>{p().payee.address ?? "—"}</dd>
            </dl>
          </div>
        </section>

        <section class="mt-6">
          <dl class="quotation-print__dl quotation-print__dl--inline">
            <dt>Payment date</dt>
            <dd>{formatPrintDate(p().payment_date)}</dd>
            <dt>Payment no.</dt>
            <dd>{p().payment_no || p().date_no_display}</dd>
            <dt>Certificate ref.</dt>
            <dd>{p().certificate_no}</dd>
          </dl>
        </section>

        <table class="quotation-print__table mt-6 w-full text-sm">
          <thead>
            <tr>
              <th class="text-left">Income payment / ATC</th>
              <th class="text-left">Description</th>
              <th class="text-right">Rate %</th>
              <th class="text-right">Amount of income</th>
              <th class="text-right">Tax withheld</th>
            </tr>
          </thead>
          <tbody>
            <For each={p().lines}>
              {(ln) => (
                <tr>
                  <td>{ln.code}</td>
                  <td>{ln.description}</td>
                  <td class="text-right">{ln.rate_pct}%</td>
                  <td class="text-right">{formatMoney(ln.base_amount)}</td>
                  <td class="text-right">{formatMoney(ln.tax_amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="text-right font-semibold">
                Total
              </td>
              <td class="text-right font-semibold">{formatMoney(p().total_base)}</td>
              <td class="text-right font-semibold">{formatMoney(p().total_tax)}</td>
            </tr>
          </tfoot>
        </table>

        <p class="mt-6 text-xs text-text-secondary">
          This certificate is generated from payment voucher withholding lines. Verify ATC codes and TIN with your tax advisor before filing.
        </p>
        <PrintBrandingFooter />
      </article>
    </>
  );
}

export default function Bir2307PrintPage() {
  return (
    <ProtectedRoute>
      <Bir2307PrintView />
    </ProtectedRoute>
  );
}
