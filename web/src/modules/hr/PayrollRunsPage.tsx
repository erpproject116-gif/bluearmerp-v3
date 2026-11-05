import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { EntityModal, Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import {
  createPayslipShareLink,
  previewPayroll,
  runPayroll,
  useInvalidatePayroll,
  usePayPeriods,
  usePayslips,
  type PayPeriod,
  type Payslip,
  type PayrollPreviewResult,
} from "../../shared/useHr";
import { exportPayrollRegisterCsv } from "../../shared/hrCsvImport";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import type { Cutoff } from "./attendanceShared";
import { formatAmount, formatPeso } from "../../shared/money";

export default function PayrollRunsPage() {
  const toast = useToast();
  const invalidate = useInvalidatePayroll();
  const periods = usePayPeriods();
  const [periodStart, setPeriodStart] = createSignal("");
  const [periodEnd, setPeriodEnd] = createSignal("");
  const [periodLabel, setPeriodLabel] = createSignal("");
  const [cutoffId, setCutoffId] = createSignal("");
  const cutoffs = createQuery(() => ({
    queryKey: ["hr-cutoffs"],
    queryFn: async () => {
      const res = await apiFetch<Cutoff[]>("/api/v1/hr/cutoffs");
      if (!res.success) throw new Error(res.message ?? "Failed to load cut-offs");
      return res.data ?? [];
    },
  }));
  const applyCutoff = (id: string) => {
    setCutoffId(id);
    if (!id) return;
    const row = (cutoffs.data ?? []).find((c) => String(c.id) === id);
    if (!row) return;
    setPeriodStart(row.cutoff_start);
    setPeriodEnd(row.cutoff_end);
    setPeriodLabel(row.label);
  };
  const [running, setRunning] = createSignal(false);
  const [previewing, setPreviewing] = createSignal(false);
  const [preview, setPreview] = createSignal<PayrollPreviewResult | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = createSignal<number | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [runOpen, setRunOpen] = createSignal(false);
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
    setRunOpen(false);
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
      <h1 class="mb-1 text-2xl font-semibold">Payroll runs</h1>
      <p class="mb-4 text-sm text-text-secondary">Compute, review and post payroll per cut-off. Pay amounts stay on this page.</p>
      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">New payroll run</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Gross pay includes base salary plus DTR premiums (OT at 125%, night diff 10%, holiday multipliers from the holiday calendar).
          Import or enter DTR in Attendance before running payroll.
          A 1st–15th cutoff does not pay the monthly salary and does not take SSS, PhilHealth, Pag-IBIG, or tax.
          Those are paid and taken once on the 16th through the end of the month. A full-month run is unchanged.
        </p>
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setRunOpen(true)}>
          New payroll run
        </button>
      </section>
      <EntityModal
        open={runOpen()}
        title="New payroll run"
        wide
        onClose={() => setRunOpen(false)}
        onSave={() => void run()}
        onSecondarySave={() => void runPreview()}
        secondarySaveLabel="Preview"
        saveLabel="Run payroll"
        saving={running() || previewing()}
      >
        <Field label="Saved cut-off">
          <select class={inputClass} value={cutoffId()} onChange={(e) => applyCutoff(e.currentTarget.value)}>
            <option value="">Type dates</option>
            <For each={cutoffs.data ?? []}>
              {(c) => (
                <option value={String(c.id)}>
                  {c.label} ({c.cutoff_start} → {c.cutoff_end})
                </option>
              )}
            </For>
          </select>
        </Field>
        <Field label="Period start"><input type="date" class={inputClass} value={periodStart()} onInput={(e) => setPeriodStart(e.currentTarget.value)} /></Field>
        <Field label="Period end"><input type="date" class={inputClass} value={periodEnd()} onInput={(e) => setPeriodEnd(e.currentTarget.value)} /></Field>
        <Field label="Label (optional)"><input class={inputClass} value={periodLabel()} onInput={(e) => setPeriodLabel(e.currentTarget.value)} /></Field>
        <div class="sm:col-span-2 lg:col-span-3">
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

        </div>
      </EntityModal>
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
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => {
              const id = selectedPeriodId();
              if (!id) return;
              window.open(`/api/v1/hr/pay-periods/${id}/bank-export?format=generic_csv`, "_blank");
            }}
          >
            Export bank file
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => {
              const id = selectedPeriodId();
              if (!id) return;
              void apiFetch(`/api/v1/hr/pay-periods/${id}/lock`, { method: "POST", body: "{}" }).then((res) => {
                if (!res.success) toast.warning(res.message ?? "Lock failed.");
                else toast.success("Period locked.");
              });
            }}
          >
            Lock period
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
            onClick={() => {
              const id = selectedPeriodId();
              if (!id) return;
              void apiFetch(`/api/v1/hr/pay-periods/${id}/unlock`, { method: "POST", body: "{}" }).then((res) => {
                if (!res.success) toast.warning(res.message ?? "Unlock failed.");
                else toast.success("Period unlocked.");
              });
            }}
          >
            Unlock period
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
            {
              key: "history",
              header: "History",
              sortable: false,
              render: (r: Payslip) => (
                <ActivityHistoryLink
                  module="hr"
                  targetType="hr_payslip"
                  targetId={r.id}
                  title={`History — ${r.employee_no || r.employee_name}`}
                />
              ),
            },
          ]}
          rows={payslips.data ?? []}
          loading={payslips.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => openPrint(row)}
          onNew={() => setRunOpen(true)}
          showNew={true}
          newLabel="New payroll run"
          codeKey="employee_no"
          nameKey="employee_name"
          page={1}
          pageSize={200}
          total={(payslips.data ?? []).length}
        />
      </Show>
      <ClientPayrollReport periods={periods.data ?? []} />
    </HrLayout>
  );
}

function ClientPayrollReport(props: { periods: PayPeriod[] }) {
  const [periodId, setPeriodId] = createSignal("");
  const report = createQuery(() => ({
    queryKey: ["hr-payroll-by-client", periodId()],
    enabled: periodId() !== "",
    queryFn: async () => {
      const res = await apiFetch<{ groups: { client_name: string; people: number; gross_pay: number; deductions: number; net_pay: number }[] }>(
        `/api/v1/hr/payroll-by-client?period_id=${periodId()}`,
      );
      if (!res.success) throw new Error(res.message ?? "Could not load the client report.");
      return res.data?.groups ?? [];
    },
  }));
  return (
    <section class="mt-8 rounded-xl border border-stroke bg-surface p-4">
      <h2 class="text-lg font-semibold">By client</h2>
      <p class="mb-3 text-sm text-text-secondary">Posted payslip totals grouped by the assignment that covers the period start. This does not create another payroll run.</p>
      <select class={inputClass + " mb-3 w-full max-w-sm"} value={periodId()} onChange={(e) => setPeriodId(e.currentTarget.value)}>
        <option value="">Choose a period</option>
        <For each={props.periods}>{(period) => <option value={period.id}>{period.period_label}</option>}</For>
      </select>
      <For each={report.data ?? []} fallback={<p class="text-sm text-text-secondary">Choose a period to see the groups.</p>}>
        {(row) => (
          <p class="border-t border-stroke py-2 text-sm">
            {row.client_name} · {row.people} · gross {formatAmount(row.gross_pay)} · deductions {formatAmount(row.deductions)} · net {formatAmount(row.net_pay)}
          </p>
        )}
      </For>
    </section>
  );
}
