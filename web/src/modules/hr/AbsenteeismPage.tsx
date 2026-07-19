import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Alert = {
  id: number; employee_id: number; employee_no?: string; employee_name?: string;
  alert_code: string; message: string; occurrence_count: number; discipline_case_id?: number | null;
};
type ReportRow = {
  employee_id: number; employee_no: string; employee_name: string; department: string;
  absent_days: number; awol_days: number; late_days: number; leave_days: number;
};

export default function AbsenteeismPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = createSignal(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = createSignal(new Date().toISOString().slice(0, 10));

  const alerts = createQuery(() => ({
    queryKey: ["hr-absence-alerts"],
    queryFn: async () => (await apiFetch<Alert[]>("/api/v1/hr/absence-alerts?status=open")).data ?? [],
  }));
  const report = createQuery(() => ({
    queryKey: ["hr-absenteeism-report", from(), to()],
    queryFn: async () => {
      const res = await apiFetch<{ rows: ReportRow[] }>(`/api/v1/hr/absenteeism-report?from=${from()}&to=${to()}`);
      return res.data?.rows ?? [];
    },
  }));

  const evaluate = async () => {
    const res = await apiFetch<{ alerts_created: number }>("/api/v1/hr/absence-alerts/evaluate", { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success(`Created ${res.data?.alerts_created ?? 0} alert(s).`);
    void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
  };

  const createDiscipline = async (a: Alert) => {
    const res = await apiFetch("/api/v1/hr/discipline/cases", {
      method: "POST",
      body: JSON.stringify({
        employee_id: a.employee_id, case_type: "nte",
        subject: `Absenteeism: ${a.alert_code}`, details: a.message, absence_alert_id: a.id,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not open draft.");
    toast.success("Discipline draft created.");
    void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Absenteeism</h1>
      <p class="mb-6 text-sm text-text-secondary">DTR threshold alerts and period reports.</p>
      <button type="button" class="mb-4 rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void evaluate()}>
        Evaluate thresholds
      </button>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Open alerts</h2>
        <For each={alerts.data ?? []} fallback={<p class="text-sm text-text-secondary">No open alerts.</p>}>
          {(a) => (
            <div class="mb-2 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 py-2 text-sm">
              <div>
                <p class="font-medium">{a.employee_no} — {a.employee_name}</p>
                <p class="text-text-secondary">{a.message}</p>
              </div>
              <Show when={!a.discipline_case_id}>
                <button type="button" class="text-xs text-amber-800" onClick={() => void createDiscipline(a)}>Create discipline draft</button>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Report</h2>
        <div class="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="From"><input type="date" class={inputClass} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} /></Field>
          <Field label="To"><input type="date" class={inputClass} value={to()} onInput={(e) => setTo(e.currentTarget.value)} /></Field>
        </div>
        <table class="min-w-full text-left text-sm">
          <thead><tr class="border-b border-stroke text-text-secondary">
            <th class="py-2 pr-3">Employee</th><th class="py-2 pr-3">Dept</th><th class="py-2 pr-3">Absent</th>
            <th class="py-2 pr-3">AWOL</th><th class="py-2 pr-3">Short</th><th class="py-2">Leave</th>
          </tr></thead>
          <tbody>
            <For each={report.data ?? []} fallback={<tr><td colSpan={6} class="py-3 text-text-secondary">No rows.</td></tr>}>
              {(r) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2 pr-3">{r.employee_no} — {r.employee_name}</td>
                  <td class="py-2 pr-3">{r.department || "—"}</td>
                  <td class="py-2 pr-3">{r.absent_days}</td>
                  <td class="py-2 pr-3">{r.awol_days}</td>
                  <td class="py-2 pr-3">{r.late_days}</td>
                  <td class="py-2">{r.leave_days}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
    </HrLayout>
  );
}
