import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type SpecialRow = {
  employee_id: number;
  employee_no: string;
  employee_name: string;
  amount: number;
  ytd_basic?: number;
  months_worked?: number;
  notes?: string;
};

type SpecialResult = {
  run_type: string;
  pay_period_id?: number;
  payslip_count: number;
  total_gross: number;
  total_net: number;
  employees: SpecialRow[];
  journal_entry_id?: number;
};

export default function SpecialRunsPage() {
  const toast = useToast();
  const [year, setYear] = createSignal(new Date().getFullYear());
  const [empId, setEmpId] = createSignal("");
  const [sepDate, setSepDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [preview13, setPreview13] = createSignal<SpecialResult | null>(null);
  const [finalPreview, setFinalPreview] = createSignal<SpecialResult | null>(null);
  const [busy, setBusy] = createSignal(false);

  const employees = createQuery(() => ({
    queryKey: ["hr-employees-special"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; employee_no: string; full_name: string }[]>(
        "/api/v1/hr/employees?page=1&pageSize=200&status=active",
      );
      return res.data ?? [];
    },
  }));

  const previewThirteenth = async () => {
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/thirteenth/preview", {
      method: "POST",
      body: JSON.stringify({ year: year() }),
    });
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Preview failed.");
      return;
    }
    setPreview13(res.data);
  };

  const runThirteenth = async () => {
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/thirteenth", {
      method: "POST",
      body: JSON.stringify({ year: year() }),
    });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Run failed.");
      return;
    }
    toast.success(`13th month posted: ${res.data?.payslip_count ?? 0} payslips.`);
    setPreview13(res.data ?? null);
  };

  const previewFinal = async () => {
    const id = Number(empId());
    if (!id) {
      toast.warning("Select an employee.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/final-pay/preview", {
      method: "POST",
      body: JSON.stringify({ employee_id: id, separation_date: sepDate() }),
    });
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Preview failed.");
      return;
    }
    setFinalPreview(res.data);
  };

  const runFinal = async () => {
    const id = Number(empId());
    if (!id) {
      toast.warning("Select an employee.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/final-pay", {
      method: "POST",
      body: JSON.stringify({ employee_id: id, separation_date: sepDate() }),
    });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Run failed.");
      return;
    }
    toast.success("Final pay posted; employee marked terminated.");
    setFinalPreview(res.data ?? null);
  };

  return (
    <HrLayout>
      <section class="mb-8 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-1 text-lg font-medium">13th month pay</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Computes (sum of BASIC payslip lines in the calendar year) ÷ 12. Preview before posting.
        </p>
        <div class="mb-3 flex flex-wrap gap-2">
          <Field label="Year">
            <input
              type="number"
              class={inputClass}
              value={year()}
              onInput={(e) => setYear(Number(e.currentTarget.value))}
            />
          </Field>
          <div class="flex items-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy()}
              onClick={() => void previewThirteenth()}
            >
              Preview
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={busy()}
              onClick={() => void runThirteenth()}
            >
              Run &amp; post
            </button>
          </div>
        </div>
        <Show when={preview13()}>
          {(p) => (
            <div class="overflow-x-auto text-sm">
              <p class="mb-2 text-text-secondary">
                {p().payslip_count} employee(s) · total ₱{p().total_gross.toFixed(2)}
              </p>
              <table class="min-w-full">
                <thead>
                  <tr class="border-b text-left text-text-secondary">
                    <th class="py-1 pr-3">Employee</th>
                    <th class="py-1 pr-3 text-right">YTD basic</th>
                    <th class="py-1 text-right">13th month</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={p().employees}>
                    {(row) => (
                      <tr class="border-b border-stroke/50">
                        <td class="py-1 pr-3">{row.employee_name}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{(row.ytd_basic ?? 0).toFixed(2)}</td>
                        <td class="py-1 text-right tabular-nums">{row.amount.toFixed(2)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          )}
        </Show>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-1 text-lg font-medium">Final pay</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Last-month pro-rate + pro-rated 13th. Unused leave cash-out waits on leave balances (coming next).
          Posting marks the employee terminated.
        </p>
        <div class="mb-3 grid gap-3 sm:grid-cols-3">
          <Field label="Employee">
            <select class={inputClass} value={empId()} onChange={(e) => setEmpId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={employees.data ?? []}>
                {(e) => (
                  <option value={e.id}>
                    {e.employee_no} — {e.full_name}
                  </option>
                )}
              </For>
            </select>
          </Field>
          <Field label="Separation date">
            <input type="date" class={inputClass} value={sepDate()} onInput={(e) => setSepDate(e.currentTarget.value)} />
          </Field>
          <div class="flex items-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy()}
              onClick={() => void previewFinal()}
            >
              Preview
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={busy()}
              onClick={() => void runFinal()}
            >
              Run &amp; post
            </button>
          </div>
        </div>
        <Show when={finalPreview()?.employees[0]}>
          {(row) => (
            <div class="rounded-lg bg-slate-50 p-3 text-sm">
              <p class="font-medium">{row().employee_name}</p>
              <p class="tabular-nums">Amount: ₱{row().amount.toFixed(2)}</p>
              <p class="text-text-secondary">{row().notes}</p>
            </div>
          )}
        </Show>
      </section>
    </HrLayout>
  );
}
