import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
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
import { HrPayrollTabs } from "./HrPayrollTabs";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrSteps, HrTcard, HrWizardNav, type HrBadgeTone } from "./HrUi";
import type { Cutoff } from "./attendanceShared";
import { formatAmount, formatPeso } from "../../shared/money";

function periodStatusTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "processed" || s === "posted" || s === "locked") return "success";
  if (s === "draft" || s === "open") return "warning";
  return "neutral";
}

function periodStatusLabel(status: string) {
  if (status === "processed") return "Posted";
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const PAY_STEPS = [
  "1. Period & group",
  "2. Pull DTR",
  "3. Compute",
  "4. Review exceptions",
  "5. Approve",
  "6. Payslips",
  "7. Bank file",
  "8. Post & lock",
];

export default function PayrollRunsPage() {
  const toast = useToast();
  const invalidate = useInvalidatePayroll();
  const periods = usePayPeriods();
  const [periodStart, setPeriodStart] = createSignal("");
  const [periodEnd, setPeriodEnd] = createSignal("");
  const [periodLabel, setPeriodLabel] = createSignal("");
  const [cutoffId, setCutoffId] = createSignal("");
  const [wizStep, setWizStep] = createSignal(0);
  const [approved, setApproved] = createSignal(false);
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
  const [showAmounts, setShowAmounts] = createSignal(false);
  const [statusSeg, setStatusSeg] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [postOpen, setPostOpen] = createSignal(false);
  const [postConfirm, setPostConfirm] = createSignal(false);
  const [detailOpen, setDetailOpen] = createSignal(false);
  const payslips = usePayslips(selectedPeriodId);

  const periodRows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (periods.data ?? []).filter((p) => {
      if (statusSeg() === "Draft" && p.status !== "draft" && p.status !== "open") return false;
      if (statusSeg() === "Posted" && p.status !== "processed" && p.status !== "locked") return false;
      if (!q) return true;
      return p.period_label.toLowerCase().includes(q) || p.period_start.includes(q) || p.period_end.includes(q);
    });
  });

  const periodNet = createMemo(() => {
    if (!selectedPeriodId()) return null;
    const slips = payslips.data ?? [];
    if (!slips.length) return null;
    return {
      count: slips.length,
      net: slips.reduce((s, r) => s + (Number(r.net_pay) || 0), 0),
    };
  });

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

  const openPeriod = (p: PayPeriod) => {
    setSelectedPeriodId(p.id);
    setDetailOpen(true);
  };

  const lockSelected = async () => {
    const id = selectedPeriodId();
    if (!id) return;
    if (!postConfirm()) return toast.warning("Confirm you reviewed exceptions and totals.");
    const res = await apiFetch(`/api/v1/hr/pay-periods/${id}/lock`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Lock failed.");
    toast.success("Period locked.");
    setPostOpen(false);
    setPostConfirm(false);
    invalidate();
  };

  return (
    <HrLayout>
      <HrPayrollTabs />
      <HrPageHead
        title="Payroll runs"
        subtitle="Compute, review and post payroll per cut-off."
        actions={
          <div class="hr-actions">
            <button type="button" class="hr-btn" onClick={() => setShowAmounts(!showAmounts())}>
              {showAmounts() ? "Hide amounts" : "👁 Show amounts"}
            </button>
            <button
              type="button"
              class="hr-btn hr-btn-primary"
              onClick={() => {
                setWizStep(0);
                setApproved(false);
                setRunOpen(true);
              }}
            >
              + New run
            </button>
          </div>
        }
      />

      <HrNotice>
        Payroll by client / pay group — today one run covers the company.
      </HrNotice>

      <Show when={runOpen()}>
        <HrTcard class="mb-6 mt-3">
          <div class="p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New payroll run</h2>
              <button type="button" class="hr-btn hr-btn-sm" onClick={() => setRunOpen(false)}>
                Close
              </button>
            </div>
            <HrSteps steps={PAY_STEPS} current={wizStep()} onSelect={setWizStep} />

            <Show when={wizStep() === 0}>
              <div class="grid grid-cols-1 gap-3 min-[1024px]:grid-cols-2">
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
                <Field label="Group">
                  <select class={inputClass} disabled>
                    <option>All employees</option>
                    <option disabled>By client</option>
                  </select>
                  <p class="mt-1 text-xs text-text-secondary">By-client run group</p>
                </Field>
                <Field label="Period start"><input type="date" class={inputClass} value={periodStart()} onInput={(e) => setPeriodStart(e.currentTarget.value)} /></Field>
                <Field label="Period end"><input type="date" class={inputClass} value={periodEnd()} onInput={(e) => setPeriodEnd(e.currentTarget.value)} /></Field>
                <Field label="Run name (optional)"><input class={inputClass} value={periodLabel()} onInput={(e) => setPeriodLabel(e.currentTarget.value)} /></Field>
              </div>
            </Show>

            <Show when={wizStep() === 1}>
              <HrNotice>
                DTR must already be entered or imported under Attendance. Client DTR acceptance stays on the Client DTR inbox — it is not written into payslip hours here.
              </HrNotice>
              <p class="mt-3 text-sm">
                <a href="/app/hr/attendance/overview" class="text-brand-700">Open attendance →</a>
                {" · "}
                <a href="/app/hr/attendance/client-dtr" class="text-brand-700">Client DTR inbox →</a>
              </p>
              <label class="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" disabled />
                <span>Proceed without excluded client branches</span>
              </label>
            </Show>

            <Show when={wizStep() === 2}>
              <p class="mb-3 text-sm text-text-secondary">Preview uses the existing payroll compute. Amounts are not posted until you run payroll on step 5.</p>
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" disabled={previewing()} onClick={() => void runPreview()}>
                {previewing() ? "Computing…" : "Compute now"}
              </button>
              <Show when={preview()}>
                {(p) => (
                  <div class="mt-4 overflow-x-auto">
                    <p class="mb-2 text-sm font-semibold">Preview {p().period_start} → {p().period_end} · {p().employee_count} employee(s)</p>
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
                )}
              </Show>
            </Show>

            <Show when={wizStep() === 3}>
              <HrNotice>Continue after you have reviewed the compute preview.</HrNotice>
            </Show>

            <Show when={wizStep() === 4}>
              <label class="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={approved()} onChange={(e) => setApproved(e.currentTarget.checked)} />
                <span>Totals reviewed. Run payroll now (posts payslips and journal).</span>
              </label>
              <button
                type="button"
                class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={!approved() || running()}
                onClick={() => void run()}
              >
                {running() ? "Running…" : "Run payroll"}
              </button>
            </Show>

            <Show when={wizStep() === 5}>
              <p class="text-sm text-text-secondary">Select a pay period below, then use Print / PDF or Copy secure employee link on a payslip row. Share links expire after 72 hours.</p>
            </Show>

            <Show when={wizStep() === 6}>
              <Field label="Bank format">
                <select class={inputClass} value="generic_csv">
                  <option value="generic_csv">Bank CSV (generic)</option>
                  <option value="other" disabled>Other bank layouts</option>
                </select>
              </Field>
              <button
                type="button"
                class="mt-3 rounded-lg border border-stroke px-3 py-1.5 text-sm"
                disabled={!selectedPeriodId()}
                onClick={() => {
                  const id = selectedPeriodId();
                  if (!id) return toast.warning("Select a pay period first.");
                  window.open(`/api/v1/hr/pay-periods/${id}/bank-export?format=generic_csv`, "_blank");
                }}
              >
                Export bank file
              </button>
            </Show>

            <Show when={wizStep() === 7}>
              <HrNotice>Locking a period is final for edits on that run. Unlock is available for administrators when needed.</HrNotice>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={!selectedPeriodId()}
                  onClick={() => {
                    const id = selectedPeriodId();
                    if (!id) return;
                    void apiFetch(`/api/v1/hr/pay-periods/${id}/lock`, { method: "POST", body: "{}" }).then((res) => {
                      if (!res.success) toast.warning(res.message ?? "Lock failed.");
                      else toast.success("Period locked.");
                    });
                  }}
                >
                  Post & lock run
                </button>
                <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setRunOpen(false)}>
                  Close wizard
                </button>
              </div>
            </Show>

            <HrWizardNav
              canBack={wizStep() > 0}
              canNext={wizStep() < PAY_STEPS.length - 1}
              onBack={() => setWizStep(Math.max(0, wizStep() - 1))}
              onNext={() => setWizStep(Math.min(PAY_STEPS.length - 1, wizStep() + 1))}
            />
          </div>
        </HrTcard>
      </Show>

      <HrTcard
        class="mt-3"
        toolbar={
          <>
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search run…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <div class="hr-seg" role="group" aria-label="Status">
              <button type="button" classList={{ on: statusSeg() === "" }} onClick={() => setStatusSeg("")}>
                All
              </button>
              <button type="button" classList={{ on: statusSeg() === "Draft" }} onClick={() => setStatusSeg("Draft")}>
                Draft
              </button>
              <button type="button" classList={{ on: statusSeg() === "Posted" }} onClick={() => setStatusSeg("Posted")}>
                Posted
              </button>
            </div>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Run</th>
                <th>Cut-off</th>
                <th>Status</th>
                <th class="num">Employees</th>
                <th class="num">Net pay</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={periodRows()}
                fallback={
                  <tr>
                    <td colspan="6">
                      <HrEmpty title="No matches" hint="Create a payroll run to start." />
                    </td>
                  </tr>
                }
              >
                {(p) => {
                  const selected = () => selectedPeriodId() === p.id;
                  const net = () => (selected() ? periodNet() : null);
                  return (
                    <tr classList={{ "bg-brand-50": selected() }}>
                      <td>
                        <button type="button" class="font-mono text-sm text-brand-700 underline-offset-2 hover:underline" onClick={() => openPeriod(p)}>
                          {p.period_label}
                        </button>
                      </td>
                      <td>
                        {p.period_start} – {p.period_end}
                      </td>
                      <td>
                        <HrBadge tone={periodStatusTone(p.status)}>{periodStatusLabel(p.status)}</HrBadge>
                      </td>
                      <td class="num">{selected() && net() ? net()!.count : selected() && payslips.isFetching ? "…" : "—"}</td>
                      <td class="num">
                        <Show when={showAmounts() && selected() && net()} fallback={<span class="hr-muted">{selected() ? "••••••" : "—"}</span>}>
                          {formatPeso(net()!.net)}
                        </Show>
                      </td>
                      <td>
                        <details class="hr-menu hr-rowmenu">
                          <summary class="hr-rowmenu-btn" aria-label="Row actions">
                            ⋯
                          </summary>
                          <div>
                            <button type="button" class="menu-item" onClick={() => openPeriod(p)}>
                              Open
                            </button>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => {
                                setSelectedPeriodId(p.id);
                                setPeriodStart(p.period_start);
                                setPeriodEnd(p.period_end);
                                setPeriodLabel(p.period_label);
                                setWizStep(2);
                                setRunOpen(true);
                              }}
                            >
                              Compute
                            </button>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => {
                                setSelectedPeriodId(p.id);
                                setPostConfirm(false);
                                setPostOpen(true);
                              }}
                            >
                              Post…
                            </button>
                            <button type="button" class="menu-item" onClick={() => openPeriod(p)}>
                              Payslips
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>

      <Show when={detailOpen() && selectedPeriodId()}>
        <section class="hr-w s12 mt-4" aria-label="Run detail">
          <header>
            <h3>
              {(periods.data ?? []).find((p) => p.id === selectedPeriodId())?.period_label ?? "Run"} · payslips
            </h3>
            <span class="grow" />
            <div class="hr-actions">
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                onClick={() => {
                  const id = selectedPeriodId();
                  if (id) void exportPayrollRegisterCsv(id).catch(() => toast.error("Export failed."));
                }}
              >
                Export register
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                onClick={() => {
                  const id = selectedPeriodId();
                  if (!id) return;
                  window.open(`/api/v1/hr/pay-periods/${id}/bank-export?format=generic_csv`, "_blank");
                }}
              >
                Bank file
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                disabled={!selectedId() || sharing()}
                onClick={() => {
                  const row = (payslips.data ?? []).find((r) => r.id === selectedId());
                  if (row) void sharePayslip(row);
                }}
              >
                {sharing() ? "Creating link…" : "Share payslip link"}
              </button>
              <button type="button" class="hr-btn hr-btn-sm" onClick={() => setDetailOpen(false)}>
                Close
              </button>
            </div>
          </header>
          <p class="hr-muted px-3 text-xs">Payslip share links expire after 72 hours.</p>
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th class="num">Gross</th>
                  <th class="num">Deductions</th>
                  <th class="num">Net</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={payslips.data ?? []}
                  fallback={
                    <tr>
                      <td colspan="6">
                        <HrEmpty title="No payslips" hint="Compute and run payroll for this period." />
                      </td>
                    </tr>
                  }
                >
                  {(r) => (
                    <tr
                      classList={{ "bg-brand-50": selectedId() === r.id }}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td>
                        <div class="font-semibold">{r.employee_name}</div>
                        <div class="hr-muted">{r.employee_no}</div>
                      </td>
                      <td class="num">{showAmounts() ? formatAmount(r.gross_pay) : "••••"}</td>
                      <td class="num">{showAmounts() ? formatAmount(r.deductions) : "••••"}</td>
                      <td class="num">{showAmounts() ? formatAmount(r.net_pay) : "••••"}</td>
                      <td>
                        <HrBadge tone="neutral">{r.status}</HrBadge>
                      </td>
                      <td>
                        <div class="flex flex-wrap gap-1">
                          <button type="button" class="hr-btn hr-btn-sm" onClick={(e) => { e.stopPropagation(); openPrint(r); }}>
                            Print
                          </button>
                          <ActivityHistoryLink
                            module="hr"
                            targetType="hr_payslip"
                            targetId={r.id}
                            title={`History — ${r.employee_no || r.employee_name}`}
                            class="hr-btn hr-btn-sm"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

      <Show when={postOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Post and lock payroll run?">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Post and lock payroll run?</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setPostOpen(false)}>
                ✕
              </button>
            </div>
            <p class="mb-3 text-sm text-text-secondary">Posting locks the run. Corrections need an adjustment run.</p>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={postConfirm()} onChange={(e) => setPostConfirm(e.currentTarget.checked)} class="mt-0.5" />
              <span>I reviewed exceptions and totals.</span>
            </label>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setPostOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void lockSelected()}>
                Post &amp; lock
              </button>
            </div>
          </div>
        </div>
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
    <section class="hr-w s12 mt-4" aria-label="By client">
      <header>
        <h3>By client</h3>
      </header>
      <p class="px-3 text-sm text-text-secondary">
        Posted payslip totals grouped by assignment. This does not create another payroll run. Bank file + by-client groups as separate runs{" "}.
      </p>
      <div class="p-3">
        <select class={inputClass + " mb-3 w-full max-w-sm"} value={periodId()} onChange={(e) => setPeriodId(e.currentTarget.value)}>
          <option value="">Choose a period</option>
          <For each={props.periods}>{(period) => <option value={period.id}>{period.period_label}</option>}</For>
        </select>
        <For each={report.data ?? []} fallback={<p class="text-sm text-text-secondary">Choose a period to see the groups.</p>}>
          {(row) => (
            <p class="border-t border-stroke py-2 text-sm">
              {row.client_name} · {row.people} · gross {formatAmount(row.gross_pay)} · deductions {formatAmount(row.deductions)} · net{" "}
              {formatAmount(row.net_pay)}
            </p>
          )}
        </For>
      </div>
    </section>
  );
}
