import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrEmpty, HrNotice, HrPageHead, HrTcard } from "./HrUi";
import { formatAmount } from "../../shared/money";

type Row = { employee_no: string; employee_name: string; tin: string; withholding: number };

const GENERATORS = [
  { id: "sss", title: "SSS R3 / contribution list", hint: "Monthly, per employee (SSS_2025_CIR_2024_006)" },
  { id: "phic", title: "PhilHealth RF-1", hint: "Monthly premium report (PHIC_2026_5PCT)" },
  { id: "hdmf", title: "Pag-IBIG MCRF", hint: "Monthly contributions (HDMF_2026_STD)" },
  { id: "bir1601c", title: "BIR 1601-C", hint: "Monthly withholding remittance" },
  { id: "bir2316", title: "BIR 2316", hint: "Annual certificate per employee" },
  { id: "bir1604c", title: "BIR alphalist (1604-C)", hint: "Annual list of employees" },
  { id: "thirteenth", title: "13th month report", hint: "Due on or before 24 Dec" },
  { id: "dole", title: "DOLE semi-annual report", hint: "DO 174 contractor report" },
] as const;

function downloadWithholdingCsv(rows: Row[], year: string) {
  const header = ["Employee no.", "Employee", "TIN", "Withholding"];
  const lines = rows.map((r) =>
    [r.employee_no, r.employee_name, r.tin, String(r.withholding)]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `withholding-${year}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function GovernmentReportsPage() {
  const toast = useToast();
  const [year, setYear] = createSignal(String(new Date().getFullYear()));
  const [search, setSearch] = createSignal("");
  const [runOpen, setRunOpen] = createSignal(false);
  const [genReport, setGenReport] = createSignal("SSS R3");
  const [genMonth, setGenMonth] = createSignal("");
  const [genFormat, setGenFormat] = createSignal("Agency file");

  const [rows] = createResource(year, async (value) => {
    if (!/^\d{4}$/.test(value)) return [];
    return (await apiFetch<Row[]>(`/api/v1/hr/government-reports/withholding?year=${value}`)).data ?? [];
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (rows() ?? []).filter((row) => {
      if (!q) return true;
      return (
        row.employee_no.toLowerCase().includes(q) ||
        row.employee_name.toLowerCase().includes(q) ||
        (row.tin || "").toLowerCase().includes(q)
      );
    });
  });

  return (
    <HrLayout>
      <HrPageHead
        title={
          <>
            Government reports
          </>
        }
        subtitle="Generate statutory files from posted payroll."
      />


      <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={[...GENERATORS]}>
          {(card) => (
            <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
              <h3 class="text-sm font-semibold">{card.title}</h3>
              <p class="mb-3 text-xs text-text-secondary">{card.hint}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="hr-btn hr-btn-sm"
                  disabled
                  title="Needs backend"
                  onClick={() => toast.warning(`${card.title} generator needs backend.`)}
                >
                  Generate
                </button>
                <button type="button" class="hr-btn hr-btn-sm" disabled title="Needs backend">
                  History
                </button>
              </div>
            </section>
          )}
        </For>
      </div>

      <div class="hr-actions mt-3">
        <button type="button" class="hr-btn hr-btn-primary" onClick={() => setRunOpen(true)}>
          Run / export…
        </button>
      </div>

      <div class="mt-6" id="withholding">
        <HrPageHead
          title="Withholding (live)"
          subtitle="Amounts already stored on payslips for the selected year. Sample withholding is in 2099."
        />
        <HrTcard
          toolbar={
            <>
              <label class="flex items-center gap-1 text-xs text-text-secondary">
                Year
                <input
                  class={`${inputClass} !w-24 !min-h-[30px] !py-1`}
                  value={year()}
                  onInput={(e) => setYear(e.currentTarget.value)}
                  aria-label="Year"
                />
              </label>
              <input
                class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                placeholder="Filter employees…"
                aria-label="Filter"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                onClick={() => {
                  const data = rows() ?? [];
                  if (!data.length) return toast.warning("Nothing to export.");
                  downloadWithholdingCsv(data, year());
                  toast.success("CSV downloaded.");
                }}
              >
                Export CSV
              </button>
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee no.</th>
                  <th>Employee</th>
                  <th>TIN</th>
                  <th class="num">Withholding</th>
                </tr>
              </thead>
              <tbody>
                <Show when={rows.loading}>
                  <tr>
                    <td colspan="4" class="hr-muted">
                      Loading…
                    </td>
                  </tr>
                </Show>
                <Show when={!rows.loading}>
                  <For
                    each={filtered()}
                    fallback={
                      <tr>
                        <td colspan="4">
                          <HrEmpty title="No withholding rows" hint="Pick a year that has posted payslips." />
                        </td>
                      </tr>
                    }
                  >
                    {(row) => (
                      <tr>
                        <td class="font-mono text-sm">{row.employee_no}</td>
                        <td>{row.employee_name}</td>
                        <td class="font-mono text-sm">{row.tin || "—"}</td>
                        <td class="num">{formatAmount(row.withholding)}</td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </HrTcard>
      </div>

      <Show when={runOpen()}>
        <div
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Generate government report"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">
                Generate government report
              </h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setRunOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Report">
                <select class={inputClass} value={genReport()} onChange={(e) => setGenReport(e.currentTarget.value)}>
                  <option>SSS R3</option>
                  <option>PhilHealth RF-1</option>
                  <option>Pag-IBIG MCRF</option>
                  <option>BIR 1601-C</option>
                </select>
              </Field>
              <Field label="Month">
                <input class={inputClass} type="month" value={genMonth()} onInput={(e) => setGenMonth(e.currentTarget.value)} />
              </Field>
              <Field label="Format">
                <select class={inputClass} value={genFormat()} onChange={(e) => setGenFormat(e.currentTarget.value)}>
                  <option>Agency file</option>
                  <option>CSV</option>
                  <option>PDF</option>
                </select>
              </Field>
            </div>
            <HrNotice>
              <b>Needs backend:</b> statutory package generators. Use Remittances for live agency exports, or Export CSV on the
              withholding table above.
            </HrNotice>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setRunOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-primary"
                disabled
                title="Needs backend"
                onClick={() => toast.warning("Generator needs backend.")}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
