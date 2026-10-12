import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";

type ReportRow = {
  case_no: string;
  employee_no: string;
  employee_name: string;
  case_type: string;
  status: string;
  has_real_file: boolean;
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default function HrReportsPage() {
  const [from, setFrom] = createSignal(isoDaysAgo(30));
  const [to, setTo] = createSignal(new Date().toISOString().slice(0, 10));

  const report = createQuery(() => ({
    queryKey: ["hr-discipline-report", from(), to()],
    queryFn: async () => {
      const res = await apiFetch<{ rows: ReportRow[] }>(
        `/api/v1/hr/reports/discipline?from=${from()}&to=${to()}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load the report.");
      return res.data?.rows ?? [];
    },
  }));

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">HR reports</h1>
      <p class="mb-6 text-sm text-text-secondary">Discipline cases opened in the selected dates.</p>
      <div class="mb-4 grid max-w-xl gap-3 sm:grid-cols-2">
        <Field label="From">
          <input class={inputClass} type="date" value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
        </Field>
        <Field label="To">
          <input class={inputClass} type="date" value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
        </Field>
      </div>
      <div class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-stroke text-text-secondary">
            <tr>
              <th class="px-3 py-2 font-medium">Case no</th>
              <th class="px-3 py-2 font-medium">Employee</th>
              <th class="px-3 py-2 font-medium">Type</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data ?? []} fallback={
              <tr><td class="px-3 py-3 text-text-secondary" colspan="5">{report.isError ? (report.error?.message ?? "Failed to load the report.") : report.isLoading ? "Loading…" : "No cases opened in this range."}</td></tr>
            }>
              {(row) => (
                <tr class="border-b border-stroke last:border-0">
                  <td class="px-3 py-2">{row.case_no}</td>
                  <td class="px-3 py-2">{row.employee_no} — {row.employee_name}</td>
                  <td class="px-3 py-2">{row.case_type}</td>
                  <td class="px-3 py-2">{row.status}</td>
                  <td class="px-3 py-2">{row.has_real_file ? "Attached" : "Missing"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={(report.data?.length ?? 0) >= 500}>
        <p class="mt-2 text-sm text-text-secondary">Showing the first 500 cases in this range.</p>
      </Show>
    </HrLayout>
  );
}
