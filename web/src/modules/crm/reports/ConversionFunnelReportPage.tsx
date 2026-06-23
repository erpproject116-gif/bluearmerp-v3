import { createSignal, For, onMount, Show } from "solid-js";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import {
  conversionFunnelExportUrl,
  useConversionFunnelReport,
  type ConversionFunnelFilters,
} from "../../../shared/useCrmReports";
import { CrmLayout } from "../CrmLayout";

function defaultFilters(): ConversionFunnelFilters {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) };
}

export default function ConversionFunnelReportPage() {
  const [draft, setDraft] = createSignal<ConversionFunnelFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<ConversionFunnelFilters | null>(null);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const auth = useAuth();

  const report = useConversionFunnelReport(() => ({
    filters: submitted() ?? defaultFilters(),
    page: 1,
    pageSize: 50,
    sort: "stage",
    order: "asc",
    enabled: submitted() !== null,
  }));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    setSubmitted({ ...draft() });
    setGeneratedAt(new Date());
  };

  const downloadCsv = async () => {
    const f = submitted();
    if (!f) return;
    const token = await getAccessToken();
    const res = await fetch(conversionFunnelExportUrl(f), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conversion-funnel.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <CrmLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Conversion funnel</h2>
        <p class="text-sm text-text-secondary">Quotes → sales orders → released → sales — Search (F8).</p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Date from">
            <DateInput
              value={draft().date_from ?? ""}
              onInput={(e) => setDraft((f) => ({ ...f, date_from: e.currentTarget.value || undefined }))}
            />
          </Field>
          <Field label="Date to">
            <DateInput
              value={draft().date_to ?? ""}
              onInput={(e) => setDraft((f) => ({ ...f, date_to: e.currentTarget.value || undefined }))}
            />
          </Field>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>
            Search (F8)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm"
            onClick={() => {
              setDraft(defaultFilters());
              setSubmitted(null);
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <Show when={submitted()}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h2 class="text-xl font-bold">Conversion funnel</h2>
            <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
          </div>
          <div class="overflow-x-auto p-4">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Stage</th>
                  <th class="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.label}</td>
                      <td class="px-3 py-2 text-right font-medium">{row.count}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between border-t border-stroke px-5 py-3 text-sm">
            <span>Generated {generatedAt().toLocaleString()}</span>
            <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => void downloadCsv()}>
              Export CSV
            </button>
          </div>
        </section>
      </Show>
    </CrmLayout>
  );
}
