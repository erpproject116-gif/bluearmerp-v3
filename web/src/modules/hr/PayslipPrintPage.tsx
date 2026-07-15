import { createResource, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { ProtectedRoute } from "../../shared/ProtectedRoute";
import { PrintToolbar } from "../../shared/PrintToolbar";
import { PrintLoading } from "../../shared/LoadingText";
import "../../quotation/quotation/quotationPrint.css";

export type PayslipDetail = {
  id: number;
  pay_period_id: number;
  period_label?: string;
  period_start?: string;
  period_end?: string;
  employee_id: number;
  employee_no?: string;
  employee_name?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: string;
  employer_total?: number;
  lines: Array<{
    id: number;
    line_no: number;
    line_type: string;
    line_code?: string;
    description: string;
    amount: number;
  }>;
};

export async function fetchPayslipDetail(id: number) {
  return apiFetch<PayslipDetail>(`/api/v1/hr/payslips/${id}`);
}

function PayslipPrintView() {
  const params = useParams<{ payslipId: string }>();
  const [data] = createResource(
    () => Number(params.payslipId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid payslip id.");
      const res = await fetchPayslipDetail(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load payslip.");
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
      <Show when={data()}>{(p) => <PayslipDocument payload={p()} secureNote={false} />}</Show>
    </div>
  );
}

export function PayslipDocument(props: { payload: PayslipDetail; secureNote: boolean }) {
  const p = () => props.payload;
  const earnings = () => p().lines.filter((l) => l.line_type === "earning");
  const deductions = () => p().lines.filter((l) => l.line_type === "deduction");
  const employer = () => p().lines.filter((l) => l.line_type === "employer_share");

  return (
    <>
      <PrintToolbar onPrint={() => window.print()} />
      <article class="quotation-print__page">
        <header class="mb-6 border-b border-slate-200 pb-4">
          <h1 class="text-2xl font-semibold text-slate-900">Payslip</h1>
          <p class="text-sm text-slate-600">{p().period_label || "Pay period"}</p>
          <Show when={props.secureNote}>
            <p class="mt-2 text-xs text-amber-800">Confidential — for the named employee only. Do not forward.</p>
          </Show>
        </header>
        <dl class="quotation-print__dl mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt>Employee #</dt>
          <dd>{p().employee_no || "—"}</dd>
          <dt>Name</dt>
          <dd>{p().employee_name || "—"}</dd>
          <dt>Period</dt>
          <dd>
            {p().period_start || "—"} → {p().period_end || "—"}
          </dd>
          <dt>Status</dt>
          <dd>{p().status}</dd>
        </dl>

        <section class="mb-4">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Earnings</h2>
          <For each={earnings()}>
            {(ln) => (
              <div class="flex justify-between border-b border-slate-100 py-1 text-sm">
                <span>{ln.description}</span>
                <span class="tabular-nums">{ln.amount.toFixed(2)}</span>
              </div>
            )}
          </For>
        </section>

        <section class="mb-4">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Employee deductions</h2>
          <For each={deductions()}>
            {(ln) => (
              <div class="flex justify-between border-b border-slate-100 py-1 text-sm">
                <span>{ln.description}</span>
                <span class="tabular-nums">-{ln.amount.toFixed(2)}</span>
              </div>
            )}
          </For>
        </section>

        <section class="mb-4">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Employer shares (for your info)</h2>
          <For each={employer()}>
            {(ln) => (
              <div class="flex justify-between border-b border-slate-100 py-1 text-sm text-slate-600">
                <span>{ln.description}</span>
                <span class="tabular-nums">{ln.amount.toFixed(2)}</span>
              </div>
            )}
          </For>
          <Show when={employer().length === 0}>
            <p class="text-sm text-slate-400">—</p>
          </Show>
        </section>

        <div class="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div class="flex justify-between py-0.5">
            <span>Gross</span>
            <span class="tabular-nums font-medium">{p().gross_pay.toFixed(2)}</span>
          </div>
          <div class="flex justify-between py-0.5">
            <span>Deductions</span>
            <span class="tabular-nums">-{p().deductions.toFixed(2)}</span>
          </div>
          <div class="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Net pay</span>
            <span class="tabular-nums">{p().net_pay.toFixed(2)}</span>
          </div>
        </div>
      </article>
    </>
  );
}

export default function PayslipPrintPage() {
  return (
    <ProtectedRoute>
      <PayslipPrintView />
    </ProtectedRoute>
  );
}
