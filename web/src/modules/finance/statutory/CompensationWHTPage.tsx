import { createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { downloadApiFile } from "../../../shared/reports/downloadReportCsv";

export default function CompensationWHTPage() {
  const toast = useToast();
  const [month, setMonth] = createSignal(new Date().toISOString().slice(0, 7));
  const [year, setYear] = createSignal(String(new Date().getFullYear()));

  const download = async (path: string, filename: string) => {
    try {
      await downloadApiFile(path, filename);
    } catch {
      toast.warning("Export failed.");
    }
  };

  return (
    <div class="mx-auto max-w-2xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Compensation WHT</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">Compensation withholding packs</h2>
        <p class="mt-1 text-sm text-amber-800">
          <strong>For accountant review — not certified eFPS.</strong> Review totals before BIR filing.
        </p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="1601-C month (YYYY-MM)">
            <input class={inputClass} type="month" value={month()} onInput={(e) => setMonth(e.currentTarget.value)} />
          </Field>
          <Field label="Alphalist tax year">
            <input class={inputClass} type="number" value={year()} onInput={(e) => setYear(e.currentTarget.value)} />
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() =>
              void download(
                `/api/v1/finance/statutory/compensation/1601c?month=${encodeURIComponent(month())}`,
                `1601C_compensation_${month()}.csv`,
              )
            }
          >
            Download 1601-C CSV
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
            onClick={() =>
              void download(
                `/api/v1/finance/statutory/compensation/employee-alphalist?year=${encodeURIComponent(year())}`,
                `employee_alphalist_${year()}.csv`,
              )
            }
          >
            Download employee alphalist CSV
          </button>
        </div>
      </section>
    </div>
  );
}
