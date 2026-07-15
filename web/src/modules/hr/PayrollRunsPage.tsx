import { createSignal, For, Show } from "solid-js";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import {
  createPayslipShareLink,
  runPayroll,
  useInvalidatePayroll,
  usePayPeriods,
  usePayslips,
  type Payslip,
} from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

export default function PayrollRunsPage() {
  const toast = useToast();
  const invalidate = useInvalidatePayroll();
  const periods = usePayPeriods();
  const [periodStart, setPeriodStart] = createSignal("");
  const [periodEnd, setPeriodEnd] = createSignal("");
  const [periodLabel, setPeriodLabel] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [selectedPeriodId, setSelectedPeriodId] = createSignal<number | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [sharing, setSharing] = createSignal(false);
  const payslips = usePayslips(selectedPeriodId);

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
      <section class="mb-6 rounded-lg border border-stroke bg-surface p-4">
        <h2 class="mb-3 text-lg font-medium">New payroll run</h2>
        <div class="grid gap-3 sm:grid-cols-4">
          <div>
            <label class="mb-1 block text-sm text-muted">Period start</label>
            <input type="date" class="w-full rounded border px-3 py-2" value={periodStart()} onInput={(e) => setPeriodStart(e.currentTarget.value)} />
          </div>
          <div>
            <label class="mb-1 block text-sm text-muted">Period end</label>
            <input type="date" class="w-full rounded border px-3 py-2" value={periodEnd()} onInput={(e) => setPeriodEnd(e.currentTarget.value)} />
          </div>
          <div>
            <label class="mb-1 block text-sm text-muted">Label (optional)</label>
            <input class="w-full rounded border px-3 py-2" value={periodLabel()} onInput={(e) => setPeriodLabel(e.currentTarget.value)} />
          </div>
          <div class="flex items-end">
            <button
              type="button"
              class="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50"
              disabled={running()}
              onClick={() => void run()}
            >
              {running() ? "Running…" : "Run payroll"}
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-medium">Pay periods</h2>
        <div class="flex flex-wrap gap-2">
          <For each={periods.data ?? []}>
            {(p) => (
              <button
                type="button"
                class="rounded border px-3 py-1.5 text-sm"
                classList={{ "border-blue-500 bg-blue-50": selectedPeriodId() === p.id }}
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
            class="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
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
            class="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
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
            { key: "gross_pay", header: "Gross", render: (r: Payslip) => <span>{r.gross_pay.toFixed(2)}</span> },
            { key: "deductions", header: "Deductions", render: (r: Payslip) => <span>{r.deductions.toFixed(2)}</span> },
            { key: "net_pay", header: "Net", render: (r: Payslip) => <span>{r.net_pay.toFixed(2)}</span> },
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
