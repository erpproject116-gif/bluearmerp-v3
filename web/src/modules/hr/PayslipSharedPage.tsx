import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { PrintLoading } from "../../shared/LoadingText";
import { PayslipDocument, type PayslipDetail } from "./PayslipPrintPage";
import "../quotation/quotation/quotationPrint.css";

export default function PayslipSharedPage() {
  const params = useParams<{ token: string }>();
  const [data] = createResource(
    () => params.token,
    async (token) => {
      if (!token || token.length < 32) throw new Error("Invalid link.");
      const res = await apiFetch<PayslipDetail>(`/api/v1/hr/payslips/shared/${encodeURIComponent(token)}`, undefined, {
        silent: true,
      });
      if (!res.success || !res.data) throw new Error(res.message ?? "Link not found or expired.");
      return res.data;
    },
  );

  return (
    <div class="quotation-print min-h-screen bg-slate-100 py-8">
      <Show when={data.loading}>
        <PrintLoading />
      </Show>
      <Show when={data.error}>
        <p class="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {String(data.error)}
        </p>
      </Show>
      <Show when={data()}>{(p) => <PayslipDocument payload={p()} secureNote />}</Show>
    </div>
  );
}
