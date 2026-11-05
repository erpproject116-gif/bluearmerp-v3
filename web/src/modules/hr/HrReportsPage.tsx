import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrReportsTabs } from "./HrReportsTabs";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrPlanned, HrTcard, type HrBadgeTone } from "./HrUi";

type ReportRow = {
  case_no: string;
  employee_no: string;
  employee_name: string;
  case_type: string;
  status: string;
  has_real_file: boolean;
};

const CASE_TYPES: Record<string, string> = {
  coaching: "Coaching",
  nte: "Notice to explain",
  written_warning: "Written warning",
  final_warning: "Final warning",
  suspension: "Suspension",
  termination: "Termination",
};

const REPORT_LIST = [
  { id: "discipline", label: "Discipline cases opened", live: true },
  { id: "headcount", label: "Headcount by department", live: false },
  { id: "ageing", label: "Problems ageing", live: false },
  { id: "assignments", label: "Assignments by client", live: false },
] as const;

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function typeLabel(value: string) {
  return CASE_TYPES[value] ?? value.replace(/_/g, " ");
}

function typeTone(value: string): HrBadgeTone {
  switch (value) {
    case "termination":
      return "danger";
    case "suspension":
    case "final_warning":
    case "written_warning":
      return "warning";
    case "nte":
      return "info";
    default:
      return "neutral";
  }
}

function statusTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "closed" || s === "cancelled") return "neutral";
  return "info";
}

function statusLabel(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function downloadCsv(rows: ReportRow[], from: string, to: string) {
  const header = ["Case no.", "Employee no.", "Employee", "Type", "Status", "File"];
  const lines = rows.map((r) =>
    [
      r.case_no,
      r.employee_no,
      r.employee_name,
      typeLabel(r.case_type),
      statusLabel(r.status),
      r.has_real_file ? "Attached" : "Missing",
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `discipline-cases-${from}-${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function HrReportsPage() {
  const toast = useToast();
  const [from, setFrom] = createSignal(isoDaysAgo(30));
  const [to, setTo] = createSignal(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = createSignal("");
  const [selectedReport, setSelectedReport] = createSignal<(typeof REPORT_LIST)[number]["id"]>("discipline");
  const [runOpen, setRunOpen] = createSignal(false);
  const [schOpen, setSchOpen] = createSignal(false);
  const [runFrom, setRunFrom] = createSignal("");
  const [runTo, setRunTo] = createSignal("");
  const [runFormat, setRunFormat] = createSignal("Screen");

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

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (report.data ?? []).filter((row) => {
      if (!q) return true;
      return (
        row.case_no.toLowerCase().includes(q) ||
        row.employee_name.toLowerCase().includes(q) ||
        row.employee_no.toLowerCase().includes(q) ||
        typeLabel(row.case_type).toLowerCase().includes(q) ||
        statusLabel(row.status).toLowerCase().includes(q)
      );
    });
  });

  const runReport = () => {
    if (runFrom()) setFrom(runFrom());
    if (runTo()) setTo(runTo());
    if (runFormat() === "CSV") {
      void report.refetch().then((result) => {
        downloadCsv(result.data ?? [], runFrom() || from(), runTo() || to());
        toast.success("CSV downloaded.");
      });
    } else if (runFormat() === "PDF") {
      toast.warning("PDF export needs backend.");
    } else {
      void report.refetch();
      toast.success("Report refreshed.");
    }
    setRunOpen(false);
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Reports &amp; compliance › HR reports</div>
      <HrReportsTabs />
      <HrPageHead
        title="HR reports"
        subtitle="Choose a report, set the period, run."
        actions={
          <button
            type="button"
            class="hr-btn"
            onClick={() => {
              if (!report.data?.length) return toast.warning("Nothing to export yet.");
              downloadCsv(report.data, from(), to());
              toast.success("CSV downloaded.");
            }}
          >
            Export
          </button>
        }
      />

      <div class="grid gap-4 lg:grid-cols-[220px_1fr]">
        <section class="rounded-xl border border-stroke bg-surface p-3 shadow-sm">
          <h4 class="mb-2 text-sm font-semibold">Reports</h4>
          <ul class="space-y-1 text-sm">
            <For each={[...REPORT_LIST]}>
              {(item) => (
                <li>
                  <Show
                    when={item.live}
                    fallback={
                      <span class="hr-muted">
                        {item.label} <HrPlanned />
                      </span>
                    }
                  >
                    <button
                      type="button"
                      class="w-full text-left font-semibold"
                      classList={{ "text-brand-700": selectedReport() === item.id }}
                      onClick={() => setSelectedReport(item.id)}
                    >
                      {item.label}
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>

        <div>
          <HrTcard
            toolbar={
              <>
                <label class="flex items-center gap-1 text-xs text-text-secondary">
                  From
                  <input
                    class={`${inputClass} !min-h-[30px] !py-1`}
                    type="date"
                    value={from()}
                    onInput={(e) => setFrom(e.currentTarget.value)}
                  />
                </label>
                <label class="flex items-center gap-1 text-xs text-text-secondary">
                  To
                  <input
                    class={`${inputClass} !min-h-[30px] !py-1`}
                    type="date"
                    value={to()}
                    onInput={(e) => setTo(e.currentTarget.value)}
                  />
                </label>
                <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => void report.refetch()}>
                  Run
                </button>
                <input
                  class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                  placeholder="Filter results…"
                  aria-label="Filter results"
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
              </>
            }
          >
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Case no.</th>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={report.isLoading}>
                    <tr>
                      <td colspan="5" class="hr-muted">
                        Loading…
                      </td>
                    </tr>
                  </Show>
                  <Show when={report.isError}>
                    <tr>
                      <td colspan="5" class="text-red-700">
                        {report.error?.message ?? "Failed to load the report."}
                      </td>
                    </tr>
                  </Show>
                  <Show when={!report.isLoading && !report.isError}>
                    <For
                      each={filtered()}
                      fallback={
                        <tr>
                          <td colspan="5">
                            <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                          </td>
                        </tr>
                      }
                    >
                      {(row) => (
                        <tr>
                          <td class="font-mono text-sm">{row.case_no}</td>
                          <td>
                            {row.employee_name}
                            <Show when={row.employee_no}>
                              <div class="hr-muted text-xs">{row.employee_no}</div>
                            </Show>
                          </td>
                          <td>
                            <HrBadge tone={typeTone(row.case_type)}>{typeLabel(row.case_type)}</HrBadge>
                          </td>
                          <td>
                            <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>
                          </td>
                          <td>
                            <Show when={row.has_real_file} fallback={<HrBadge tone="warning">Missing</HrBadge>}>
                              <HrBadge tone="success">Attached</HrBadge>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-xs text-text-secondary">
              <span>
                Showing {filtered().length} of {(report.data ?? []).length}
                <Show when={(report.data?.length ?? 0) >= 500}> (first 500)</Show>
              </span>
            </div>
          </HrTcard>
        </div>
      </div>

      <div class="hr-actions mt-3">
        <button
          type="button"
          class="hr-btn hr-btn-primary"
          onClick={() => {
            setRunFrom(from());
            setRunTo(to());
            setRunOpen(true);
          }}
        >
          Run…
        </button>
        <button type="button" class="hr-btn" onClick={() => setSchOpen(true)}>
          Schedule…
        </button>
      </div>

      <Show when={runOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Run report"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Run report</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setRunOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Report">
                <select class={inputClass} value="discipline" disabled>
                  <option value="discipline">Discipline cases</option>
                </select>
              </Field>
              <Field label="From">
                <input class={inputClass} type="date" value={runFrom()} onInput={(e) => setRunFrom(e.currentTarget.value)} />
              </Field>
              <Field label="To">
                <input class={inputClass} type="date" value={runTo()} onInput={(e) => setRunTo(e.currentTarget.value)} />
              </Field>
              <Field label="Format">
                <select class={inputClass} value={runFormat()} onChange={(e) => setRunFormat(e.currentTarget.value)}>
                  <option>Screen</option>
                  <option>CSV</option>
                  <option>PDF</option>
                </select>
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setRunOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => runReport()}>
                Run
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={schOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Schedule report"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">
                Schedule report <HrPlanned />
              </h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setSchOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Frequency">
                <select class={inputClass} disabled>
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </Field>
              <Field label="Recipients (HR users)">
                <input class={inputClass} type="text" disabled placeholder="Needs backend" />
              </Field>
            </div>
            <HrNotice>
              <b>Needs backend:</b> report scheduling.
            </HrNotice>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setSchOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-primary"
                disabled
                title="Needs backend"
                onClick={() => toast.warning("Scheduling needs backend.")}
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
