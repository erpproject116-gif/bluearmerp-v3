import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { ProtectedRoute } from "../../shared/ProtectedRoute";
import { LoadingText } from "../../shared/LoadingText";
import { formatPeso } from "../../shared/money";

type EssMe = {
  id: number;
  employee_no: string;
  full_name: string;
  department: string;
  job_title: string;
};

type EssPayslip = {
  id: number;
  period_label?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: string;
};

function EssSelfServiceView() {
  // Return null (don't throw) when no employee is linked — throwing from
  // createResource surfaces as a pageerror and breaks route smoke.
  const [me] = createResource(async () => {
    const res = await apiFetch<EssMe>("/api/v1/hr/ess/me");
    if (!res.success || !res.data) return null;
    return res.data;
  });
  const [payslips] = createResource(async () => {
    const res = await apiFetch<EssPayslip[]>("/api/v1/hr/ess/payslips");
    if (!res.success) return [];
    return res.data ?? [];
  });

  return (
    <div class="mx-auto max-w-3xl p-6">
      <h1 class="mb-1 text-2xl font-semibold text-text-primary">My HR</h1>
      <p class="mb-6 text-sm text-text-secondary">Employee self-service — your profile and posted payslips.</p>

      <Show when={me.loading}>
        <LoadingText />
      </Show>
      <Show when={!me.loading && me() === null}>
        <p class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No employee profile linked to your user. Ask HR to set user_id on your employee record.
        </p>
      </Show>
      <Show when={me()}>
        {(e) => (
          <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-text-secondary">Profile</h2>
            <p class="mt-2 text-lg font-medium">{e().full_name}</p>
            <p class="text-sm text-text-secondary">
              {e().employee_no} · {e().job_title || "—"} · {e().department || "—"}
            </p>
          </section>
        )}
      </Show>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Payslips</h2>
        <Show when={payslips.loading}>
          <LoadingText />
        </Show>
        <Show when={(payslips() ?? []).length === 0 && !payslips.loading}>
          <p class="text-sm text-text-secondary">No posted payslips yet.</p>
        </Show>
        <ul class="divide-y divide-stroke">
          <For each={payslips() ?? []}>
            {(p) => (
              <li class="flex items-center justify-between py-2 text-sm">
                <div>
                  <p class="font-medium">{p.period_label || `Payslip #${p.id}`}</p>
                  <p class="text-text-secondary">
                    Gross {formatPeso(p.gross_pay)} · Net {formatPeso(p.net_pay)}
                  </p>
                </div>
                <A href={`/app/hr/payslips/${p.id}/print`} class="text-brand-700 hover:underline" target="_blank">
                  View
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}

export default function EssSelfServicePage() {
  return (
    <ProtectedRoute>
      <EssSelfServiceView />
    </ProtectedRoute>
  );
}
