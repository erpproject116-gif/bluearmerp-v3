import { type Accessor, type JSX, Show } from "solid-js";
import { useAuth } from "../auth-context";
import { uiLabel } from "../branding/uiLabel";

export type ReportPageLayoutProps = {
  title: string;
  description?: string;
  dateFrom?: Accessor<string>;
  dateTo?: Accessor<string>;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  showDateFilters?: boolean;
  onSearch: () => void;
  onReset: () => void;
  onExportCsv?: () => void;
  submitted: boolean;
  loading?: boolean;
  generatedAt?: Date;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  filterExtra?: JSX.Element;
  children: JSX.Element;
};

export function ReportPageLayout(props: ReportPageLayoutProps) {
  const auth = useAuth();
  const showDates = () => props.showDateFilters !== false && props.dateFrom && props.dateTo;

  return (
    <>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
        <Show when={props.description}>
          <p class="text-sm text-text-secondary">{props.description}</p>
        </Show>
        <Show when={showDates()}>
          <div class="mt-4 flex flex-wrap items-end gap-3">
            <label class="text-sm">
              <span class="mb-1 block text-text-secondary">{uiLabel("reports.date_from")}</span>
              <input
                type="date"
                class="rounded-lg border border-stroke px-3 py-2"
                value={props.dateFrom!()}
                onInput={(e) => props.onDateFromChange!(e.currentTarget.value)}
              />
            </label>
            <label class="text-sm">
              <span class="mb-1 block text-text-secondary">{uiLabel("reports.date_to")}</span>
              <input
                type="date"
                class="rounded-lg border border-stroke px-3 py-2"
                value={props.dateTo!()}
                onInput={(e) => props.onDateToChange!(e.currentTarget.value)}
              />
            </label>
          </div>
        </Show>
        <Show when={props.filterExtra}>{props.filterExtra}</Show>
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => props.onSearch()}
          >
            {uiLabel("reports.search_button")}
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onReset()}>
            {uiLabel("reports.reset_button")}
          </button>
        </div>
      </section>

      <Show when={props.submitted}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h2 class="text-xl font-bold">{props.title}</h2>
            <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
          </div>
          <div class="overflow-x-auto">{props.children}</div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
            <span>
              {uiLabel("reports.generated_prefix")} {(props.generatedAt ?? new Date()).toLocaleString()}
              <Show when={props.loading}>
                <span class="ml-2 text-text-secondary">{uiLabel("common.loading")}</span>
              </Show>
            </span>
            <div class="flex gap-2">
              <Show when={props.onExportCsv}>
                <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => props.onExportCsv!()}>
                  {uiLabel("reports.export_csv")}
                </button>
              </Show>
              <Show when={props.onPageChange && props.page && props.totalPages}>
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                  disabled={(props.page ?? 1) <= 1}
                  onClick={() => props.onPageChange!(props.page! - 1)}
                >
                  {uiLabel("reports.prev_page")}
                </button>
                <span>
                  Page {props.page} / {props.totalPages}
                </span>
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                  disabled={(props.page ?? 1) >= (props.totalPages ?? 1)}
                  onClick={() => props.onPageChange!(props.page! + 1)}
                >
                  {uiLabel("reports.next_page")}
                </button>
              </Show>
            </div>
          </div>
        </section>
      </Show>
    </>
  );
}

export function defaultReportDateRange(): { date_from: string; date_to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}
