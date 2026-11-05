import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPayrollTabs } from "./HrPayrollTabs";
import { HrPageHead, HrTcard } from "./HrUi";
import { formatAmount, formatPeso } from "../../shared/money";

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
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [sepDate, setSepDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [preview13, setPreview13] = createSignal<SpecialResult | null>(null);
  const [finalPreview, setFinalPreview] = createSignal<SpecialResult | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [thirteenthOpen, setThirteenthOpen] = createSignal(false);
  const [finalOpen, setFinalOpen] = createSignal(false);

  const previewThirteenth = async () => {
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/thirteenth/preview", {
      method: "POST",
      body: JSON.stringify({ year: year() }),
    });
    setBusy(false);
    if (!res.success || !res.data) return toast.warning(res.message ?? "Preview failed.");
    setPreview13(res.data);
  };

  const runThirteenth = async () => {
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/thirteenth", {
      method: "POST",
      body: JSON.stringify({ year: year() }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Run failed.");
    toast.success(`13th month posted: ${res.data?.payslip_count ?? 0} payslips.`);
    setPreview13(res.data ?? null);
  };

  const previewFinal = async () => {
    const id = Number(empId());
    if (!id) return toast.warning("Select an employee.");
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/final-pay/preview", {
      method: "POST",
      body: JSON.stringify({ employee_id: id, separation_date: sepDate() }),
    });
    setBusy(false);
    if (!res.success || !res.data) return toast.warning(res.message ?? "Preview failed.");
    setFinalPreview(res.data);
  };

  const runFinal = async () => {
    const id = Number(empId());
    if (!id) return toast.warning("Select an employee.");
    setBusy(true);
    const res = await apiFetch<SpecialResult>("/api/v1/hr/special-runs/final-pay", {
      method: "POST",
      body: JSON.stringify({ employee_id: id, separation_date: sepDate() }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Run failed.");
    toast.success("Final pay posted; employee marked terminated.");
    setFinalPreview(res.data ?? null);
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Payroll › Special runs</div>
      <HrPayrollTabs />
      <HrPageHead title="Special runs" subtitle="13th month and final pay. Preview before posting." />

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="hr-w s12" aria-label="13th month">
          <header>
            <h3>13th month pay</h3>
            <span class="grow" />
            <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => setThirteenthOpen(true)}>
              + New 13th month
            </button>
          </header>
          <p class="px-3 pb-3 text-sm text-text-secondary">
            Computes (sum of BASIC payslip lines in the calendar year) ÷ 12. Preview before posting.
          </p>
        </section>

        <section class="hr-w s12" aria-label="Final pay">
          <header>
            <h3>Final pay</h3>
            <span class="grow" />
            <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => setFinalOpen(true)}>
              + New final pay
            </button>
          </header>
          <p class="px-3 pb-3 text-sm text-text-secondary">
            Last-month pro-rate + leave cash-out + pro-rated 13th. Posting marks the employee terminated.
          </p>
        </section>
      </div>

      <Show when={thirteenthOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New 13th month">
          <div class="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New 13th month</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setThirteenthOpen(false)}>
                ✕
              </button>
            </div>
            <Field label="Year">
              <input type="number" class={inputClass} value={year()} onInput={(e) => setYear(Number(e.currentTarget.value))} />
            </Field>
            <Show when={preview13()}>
              {(p) => (
                <HrTcard class="mt-3">
                  <div class="p-3">
                    <p class="mb-2 text-sm text-text-secondary">
                      {p().payslip_count} employee(s) · total {formatPeso(p().total_gross)}
                    </p>
                    <div class="hr-tbl-wrap">
                      <table class="hr-tbl">
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th class="num">YTD basic</th>
                            <th class="num">13th month</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={p().employees}>
                            {(row) => (
                              <tr>
                                <td>{row.employee_name}</td>
                                <td class="num">{formatAmount(row.ytd_basic ?? 0)}</td>
                                <td class="num">{formatAmount(row.amount)}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </HrTcard>
              )}
            </Show>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setThirteenthOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn" disabled={busy()} onClick={() => void previewThirteenth()}>
                Preview
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void runThirteenth()}>
                Run &amp; post
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={finalOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New final pay">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New final pay</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setFinalOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <LookupCombo
                label="Employee"
                value={empLabel}
                selectedId={empId}
                onInput={setEmpLabel}
                onSelect={(o) => {
                  setEmpId(o.id);
                  setEmpLabel(o.label);
                }}
                onClear={() => {
                  setEmpId(null);
                  setEmpLabel("");
                }}
                fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
                placeholder="Search employees…"
              />
              <Field label="Separation date">
                <input type="date" class={inputClass} value={sepDate()} onInput={(e) => setSepDate(e.currentTarget.value)} />
              </Field>
            </div>
            <Show when={finalPreview()?.employees[0]}>
              {(row) => (
                <div class="mt-3 rounded-lg border border-stroke bg-panel p-3 text-sm">
                  <p class="font-medium">{row().employee_name}</p>
                  <p class="tabular-nums">Amount: {formatPeso(row().amount)}</p>
                  <p class="text-text-secondary">{row().notes}</p>
                </div>
              )}
            </Show>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setFinalOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn" disabled={busy()} onClick={() => void previewFinal()}>
                Preview
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void runFinal()}>
                Run &amp; post
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
