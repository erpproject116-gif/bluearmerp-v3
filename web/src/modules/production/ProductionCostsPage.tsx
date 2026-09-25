import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { formatMoney } from "../../shared/money";
import { defaultReportDateRange, ReportPageLayout } from "../../shared/reports/ReportPageLayout";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { RecordCostsModal } from "./RecordCostsModal";

type CostRow = {
  work_order_id: number;
  work_order_no: string;
  order_date: string;
  bom_type: string;
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  other_cost: number;
  total_cost: number;
  journal_entry_id: number | null;
  journal_status: string | null;
  reversal_journal_entry_id: number | null;
  books_status: string;
};

type DateFilters = {
  date_from: string;
  date_to: string;
  bom_type?: string;
  books_status?: string;
};

const NOTE =
  "These amounts were added to inventory and credited to cost of goods when the job was completed. They are not purchase expenses. A later sale still uses the item purchase price.";

function bomTypeLabel(bomType: string): string {
  if (bomType === "disassembly") return "Cutting";
  if (bomType === "recipe") return "Recipe";
  return "Assembly";
}

function booksLabel(status: string): string {
  if (status === "posted") return "Posted";
  if (status === "draft") return "Draft";
  if (status === "reversed") return "Reversed";
  return "Not in the books";
}

function journalHref(id: number): string {
  return `/app/finance/acct-i/journal-entries?highlight=${id}`;
}

export default function ProductionCostsPage() {
  const auth = useAuth();
  const canRecord = () => hasPermission(auth.me, "manufacturing.work_orders", "write");
  const [recordWorkOrderId, setRecordWorkOrderId] = createSignal<number | null>(null);
  const defaults = defaultReportDateRange();
  const [draftFilters, setDraftFilters] = createSignal<DateFilters>(defaults);
  const [filters, setFilters] = createSignal<DateFilters>(defaults);
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = createQuery(() => {
    const f = filters();
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      date_from: f.date_from,
      date_to: f.date_to,
    });
    if (f.bom_type) qs.set("bom_type", f.bom_type);
    if (f.books_status) qs.set("books_status", f.books_status);
    return {
      queryKey: ["mfg-production-costs", page(), pageSize(), f],
      queryFn: async () => {
        const res = await apiFetch<CostRow[]>(`/api/v1/manufacturing/reports/production-costs?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load production costs");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      enabled: submitted(),
    };
  });

  const search = () => {
    setFilters({ ...draftFilters() });
    setSubmitted(true);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const patch = (p: Partial<DateFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));
  const rows = () => report.data?.rows ?? [];

  return (
    <ReportPageLayout
      title="Production costs"
      description={NOTE}
      dateFrom={() => draftFilters().date_from}
      dateTo={() => draftFilters().date_to}
      onDateFromChange={(v) => patch({ date_from: v })}
      onDateToChange={(v) => patch({ date_to: v })}
      submitted={submitted()}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onSearch={search}
      onReset={() => {
        setDraftFilters(defaults);
        setFilters(defaults);
        setSubmitted(true);
        setPage(1);
      }}
      exportFilename="production-costs"
      filterExtra={
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Type">
            <select
              class={inputClass}
              value={draftFilters().bom_type ?? ""}
              onChange={(e) => patch({ bom_type: e.currentTarget.value || undefined })}
            >
              <option value="">All</option>
              <option value="assembly">Assembly</option>
              <option value="disassembly">Cutting</option>
              <option value="recipe">Recipe</option>
            </select>
          </Field>
          <Field label="Books status">
            <select
              class={inputClass}
              value={draftFilters().books_status ?? ""}
              onChange={(e) => patch({ books_status: e.currentTarget.value || undefined })}
            >
              <option value="">All</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="reversed">Reversed</option>
              <option value="not_posted">Not in the books</option>
            </select>
          </Field>
        </div>
      }
    >
      <table class="erp-grid min-w-full text-left text-sm">
        <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Job</th>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2 text-right">Material</th>
            <th class="px-3 py-2 text-right">Labor</th>
            <th class="px-3 py-2 text-right">Overhead</th>
            <th class="px-3 py-2 text-right">Other</th>
            <th class="px-3 py-2 text-right">Total</th>
            <th class="px-3 py-2">Books status</th>
          </tr>
        </thead>
        <tbody>
          <Show
            when={rows().length > 0}
            fallback={
              <tr class="border-t border-stroke/60">
                <td class="px-3 py-4 text-text-secondary" colspan="9">
                  No production costs in this range.
                </td>
              </tr>
            }
          >
            <For each={rows()}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.order_date.slice(0, 10)}</td>
                  <td class="px-3 py-2">
                    <A
                      class="text-brand-700 underline"
                      href={`/app/production/all/jobs?status=completed&q=${encodeURIComponent(row.work_order_no)}`}
                    >
                      {row.work_order_no}
                    </A>
                  </td>
                  <td class="px-3 py-2">{bomTypeLabel(row.bom_type)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.material_cost)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.labor_cost)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.overhead_cost)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.other_cost)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.total_cost)}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span>{booksLabel(row.books_status)}</span>
                      <Show when={row.books_status !== "not_posted" && row.journal_entry_id}>
                        <A class="text-brand-700 underline" href={journalHref(row.journal_entry_id!)}>
                          Journal
                        </A>
                      </Show>
                      <Show when={row.books_status === "reversed" && row.reversal_journal_entry_id}>
                        <A class="text-brand-700 underline" href={journalHref(row.reversal_journal_entry_id!)}>
                          Reversal
                        </A>
                      </Show>
                      <Show when={canRecord() && row.total_cost > 0 && (row.books_status === "not_posted" || row.books_status === "draft")}>
                        <button
                          type="button"
                          class="rounded-md border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          onClick={() => setRecordWorkOrderId(row.work_order_id)}
                        >
                          {row.books_status === "draft" ? "Edit accounts" : "Record in books"}
                        </button>
                      </Show>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
      <RecordCostsModal
        workOrderId={recordWorkOrderId()}
        open={recordWorkOrderId() !== null}
        onClose={() => setRecordWorkOrderId(null)}
        onSaved={() => void report.refetch()}
      />
    </ReportPageLayout>
  );
}
