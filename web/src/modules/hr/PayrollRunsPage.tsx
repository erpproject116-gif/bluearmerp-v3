import { createSignal, For, Show } from "solid-js";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import {
  createPayslipShareLink,
  previewPayroll,
  runPayroll,
  useInvalidatePayroll,
  usePayPeriods,
  usePayslips,
  type Payslip,
  type PayrollPreviewResult,
} from "../../shared/useHr";
import { exportPayrollRegisterCsv } from "../../shared/hrCsvImport";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { formatAmount, formatPeso } from "../../shared/money";

export default function PayrollRunsPage() {
  const toast = useToast();
  const invalidate = useInvalidatePayroll();
  const periods = usePayPeriods();
  const [periodStart, setPeriodStart] = createSignal("");
  const [periodEnd, setPeriodEnd] = createSignal("");
  const [periodLabel, setPeriodLabel] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [previewing, setPreviewing] = createSignal(false);
  const [preview, setPreview] = createSignal<PayrollPreviewResult | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = createSignal<number | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [sharing, setSharing] = createSignal(false);
  const payslips = usePayslips(selectedPeriodId);

  const runPreview = async () => {
    if (!periodStart() || !periodEnd()) {
      toast.warning("Period start and end are required.");
      return;
    }
    setPreviewing(true);
    const res = await previewPayroll({ period_start: periodStart(), period_end: periodEnd() });
    setPreviewing(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Preview failed.");
      setPreview(null);
      return;
    }
    setPreview(res.data);
    const withPremiums = res.data.employees.filter((e) => e.premium_total > 0).length;
    toast.success(
      `Preview: ${res.data.employee_count} employee(s), gross ${formatPeso(res.data.total_gross)}` +
        (withPremiums > 0 ? ` (${withPremiums} with DTR premiums)` : ""),
    );
  };

  const run = async () => {
    if (!periodStart() || !periodEnd()) {
      toast.warning("Period start and end are required.");
      return;
    }
    setRunning(true);
    const res = await runPayroll({
      period_start: periodStart(),
      period_end: periodEnd(),
      period_label: periodLabel().trim() || undefined,
    });
    setRunning(false);
    if (!res.success) {
      toast.warning(res.message ?? "Payroll run failed.");
      return;
    }
    toast.success(`Generated ${res.data?.payslip_count ?? 0} payslips. JE #${res.data?.journal_entry_id ?? "—"}`);
    setPreview(null);
    if (res.data?.pay_period_id) setSelectedPeriodId(res.data.pay_period_id);
    invalidate();
  };

  const openPrint = (row: Payslip) => {
    window.open(`/app/hr/payslips/${row.id}/print`, "_blank", "noopener,noreferrer");
  };

  const sharePayslip = async (row: Payslip) => {
    setSharing(true);
    const res = await createPayslipShareLink(row.id);
    setSharing(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not create share link.");
      return;
    }
    const url = `${window.location.origin}${res.data.url_path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Secure payslip link copied (expires ${new Date(res.data.expires_at).toLocaleString()}).`);
    } catch {
      toast.action({
        type: "success",
        title: "Secure payslip link",
        message: url,
      });
    }
  };

  return (
    <HrLayout>
      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">New payroll run</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Gross pay includes base salary plus DTR premiums (OT at 125%, night diff 10%, holiday multipliers from the holiday calendar).
          Import or enter DTR in Attendance before running payroll.
        </p>
        <div class="grid gap-3 sm:grid-cols-4">
          <Field label="Period start"><input type="date" class={inputClass} value={periodStart()} onInput={(e) => setPeriodStart(e.currentTarget.value)} /></Field>
          <Field label="Period end"><input type="date" class={inputClass} value={periodEnd()} onInput={(e) => setPeriodEnd(e.currentTarget.value)} /></Field>
          <Field label="Label (optional)"><input class={inputClass} value={periodLabel()} onInput={(e) => setPeriodLabel(e.currentTarget.value)} /></Field>
          <div class="flex items-end gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:erp-panel disabled:opacity-50"
              disabled={previewing() || running()}
              onClick={() => void runPreview()}
            >
              {previewing() ? "Previewing…" : "Preview"}
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={running() || previewing()}
              onClick={() => void run()}
            >
              {running() ? "Running…" : "Run payroll"}
            </button>
          </div>
        </div>
      </section>

      <Show when={preview()}>
        {(p) => (
          <section class="mb-6 rounded-xl border border-stroke bg-slate-50 p-4">
            <h3 class="mb-2 text-sm font-semibold text-text-primary">
              Preview {p().period_start} → {p().period_end} · {p().employee_count} employee(s)
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="border-b border-stroke text-left text-text-secondary">
                    <th class="py-1 pr-3">Employee</th>
                    <th class="py-1 pr-3 text-right">Basic</th>
                    <th class="py-1 pr-3 text-right">Premiums</th>
                    <th class="py-1 pr-3 text-right">Gross</th>
                    <th class="py-1 pr-3 text-right">Net</th>
                    <th class="py-1 text-right">DTR days</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={p().employees}>
                    {(row) => (
                      <tr class="border-b border-stroke/60">
                        <td class="py-1 pr-3">{row.employee_name}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{formatAmount(row.base_salary)}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{formatAmount(row.premium_total)}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{formatAmount(row.gross_pay)}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{formatAmount(row.net_pay)}</td>
                        <td class="py-1 text-right tabular-nums">{row.dtr_days}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Show>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-medium">Pay periods</h2>
        <div class="flex flex-wrap gap-2">
          <For each={periods.data ?? []}>
            {(p) => (
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
                classList={{ "border-brand-500 bg-brand-50 text-brand-700": selectedPeriodId() === p.id }}
                onClick={() => setSelectedPeriodId(p.id)}
              >
                {p.period_label} ({p.status})
              </button>
            )}
          </For>
        </div>
      </section>

      <Show when={selectedPeriodId()}>
        <div class="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => {
              const id = selectedPeriodId();
              if (id) void exportPayrollRegisterCsv(id).catch(() => toast.error("Export failed."));
            }}
          >
            Export payroll register (CSV)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel disabled:opacity-50"
            disabled={!selectedId()}
            onClick={() => {
              const row = (payslips.data ?? []).find((r) => r.id === selectedId());
              if (row) openPrint(row);
            }}
          >
            Print / PDF
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel disabled:opacity-50"
            disabled={!selectedId() || sharing()}
            onClick={() => {
              const row = (payslips.data ?? []).find((r) => r.id === selectedId());
              if (row) void sharePayslip(row);
            }}
          >
            {sharing() ? "Creating link…" : "Copy secure employee link"}
          </button>
        </div>
        <SpreadsheetGrid
          columns={[
            { key: "employee_no", header: "Employee #" },
            { key: "employee_name", header: "Name" },
            { key: "gross_pay", header: "Gross", render: (r: Payslip) => <span>{formatAmount(r.gross_pay)}</span> },
            { key: "deductions", header: "Deductions", render: (r: Payslip) => <span>{formatAmount(r.deductions)}</span> },
            { key: "net_pay", header: "Net", render: (r: Payslip) => <span>{formatAmount(r.net_pay)}</span> },
            { key: "status", header: "Status" },
          ]}
          rows={payslips.data ?? []}
          loading={payslips.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => openPrint(row)}
          onNew={() => {}}
          showNew={false}
          codeKey="employee_no"
          nameKey="employee_name"
          page={1}
          pageSize={200}
          total={(payslips.data ?? []).length}
        />
      </Show>
    </HrLayout>
  );
}
