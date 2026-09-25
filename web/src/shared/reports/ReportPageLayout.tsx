import { type Accessor, createSignal, type JSX, Show } from "solid-js";
import { useAuth } from "../auth-context";
import { PrintBrandingFooter } from "../branding/PrintBrandingFooter";
import { PrintBrandingHeader } from "../branding/PrintBrandingHeader";
import { uiLabel } from "../branding/uiLabel";
import { CollapsibleFilterPanel } from "../CollapsibleFilterPanel";
import { GridExportButtons } from "../gridExport";
import { PageJumpControl } from "../PageJumpControl";
import { PageSizeSelect } from "../pageSize";
import {
  inferReportDatePreset,
  localISODate,
  ReportDatePresets,
  type ReportDatePresetId,
} from "./ReportDatePresets";
import { ReportLoadingOverlay } from "./ReportLoadingOverlay";

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
  /** Optional API CSV download (kept alongside client Print/CSV/Excel/PDF). */
  onExportCsv?: () => void;
  submitted: boolean;
  loading?: boolean;
  generatedAt?: Date;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  filterExtra?: JSX.Element;
  children: JSX.Element;
  /** Filename stem for client-side exports from the on-screen table. */
  exportFilename?: string;
  /** When false, filter panel starts collapsed. Default true (open). */
  filtersOpenByDefault?: boolean;
};

export function ReportPageLayout(props: ReportPageLayoutProps) {
  const auth = useAuth();
  const showDates = () => props.showDateFilters !== false && props.dateFrom && props.dateTo;
  /** When user clicks Custom, keep it highlighted even if dates still match a preset. */
  const [customOverride, setCustomOverride] = createSignal(false);
  const datePreset = (): ReportDatePresetId => {
    if (customOverride()) return "custom";
    if (props.dateFrom && props.dateTo) {
      return inferReportDatePreset(props.dateFrom(), props.dateTo());
    }
    return "custom";
  };
  let reportBodyEl: HTMLDivElement | undefined;

  const exportName = () =>
    (props.exportFilename ?? props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) ||
    "report";

  return (
    <>
      <CollapsibleFilterPanel
        title={props.title}
        description={props.description}
        defaultOpen={props.filtersOpenByDefault !== false}
        actions={
          <>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={props.loading === true}
              onClick={() => props.onSearch()}
            >
              {props.loading ? "Running…" : uiLabel("reports.search_button", "Run Report")}
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onReset()}>
              {uiLabel("reports.reset_button")}
            </button>
          </>
        }
      >
        <Show when={showDates() || props.filterExtra}>
          <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Filters</p>
        </Show>
        <Show when={showDates()}>
          <div class="mt-2 space-y-3">
            <ReportDatePresets
              value={datePreset()}
              onChange={(preset, range) => {
                if (preset === "custom" || !range) {
                  setCustomOverride(true);
                  return;
                }
                setCustomOverride(false);
                if (props.onDateFromChange && props.onDateToChange) {
                  props.onDateFromChange(range.date_from);
                  props.onDateToChange(range.date_to);
                }
              }}
            />
            <div class="flex flex-wrap items-end gap-3">
              <label class="text-sm">
                <span class="mb-1 block text-text-secondary">{uiLabel("reports.date_from")}</span>
                <input
                  type="date"
                  required
                  class="rounded-lg border border-stroke px-3 py-2"
                  value={props.dateFrom!() || ""}
                  onInput={(e) => {
                    setCustomOverride(true);
                    props.onDateFromChange!(e.currentTarget.value);
                  }}
                />
              </label>
              <label class="text-sm">
                <span class="mb-1 block text-text-secondary">{uiLabel("reports.date_to")}</span>
                <input
                  type="date"
                  required
                  class="rounded-lg border border-stroke px-3 py-2"
                  value={props.dateTo!() || ""}
                  onInput={(e) => {
                    setCustomOverride(true);
                    props.onDateToChange!(e.currentTarget.value);
                  }}
                />
              </label>
            </div>
          </div>
        </Show>
        <Show when={props.filterExtra}>{props.filterExtra}</Show>
      </CollapsibleFilterPanel>

      <Show when={props.submitted}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-stroke px-5 py-4">
            <div class="min-w-0 flex-1">
              <PrintBrandingHeader
                docTitle={props.title}
                tenantFallbackName={auth.me?.tenant.company_name}
              />
            </div>
            <GridExportButtons
              title={props.title}
              filename={exportName()}
              columns={[]}
              rows={() => []}
              scrapeRoot={() => reportBodyEl}
            />
          </div>
          <div class="overflow-x-auto px-5" ref={(el) => (reportBodyEl = el)}>
            <ReportLoadingOverlay loading={props.loading === true}>{props.children}</ReportLoadingOverlay>
          </div>
          <div class="border-t border-stroke px-5 py-3">
            <PrintBrandingFooter
              defaultFooter={`${uiLabel("reports.generated_prefix")} ${(props.generatedAt ?? new Date()).toLocaleString()}`}
            />
            <div class="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Show when={props.loading}>
                <span class="font-medium text-brand-700">{uiLabel("common.loading", "Loading…")}</span>
              </Show>
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <Show when={props.onExportCsv}>
                  <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => props.onExportCsv!()}>
                    {uiLabel("reports.export_csv")} (API)
                  </button>
                </Show>
                <Show when={props.onPageSizeChange && props.pageSize}>
                  <PageSizeSelect
                    value={props.pageSize!}
                    disabled={props.loading === true}
                    onChange={(n) => {
                      props.onPageSizeChange!(n);
                      if ((props.page ?? 1) !== 1) props.onPageChange?.(1);
                    }}
                  />
                </Show>
                <Show when={props.onPageChange && props.page && props.totalPages}>
                  <button
                    type="button"
                    class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                    disabled={(props.page ?? 1) <= 1 || props.loading === true}
                    onClick={() => props.onPageChange!(props.page! - 1)}
                  >
                    {uiLabel("reports.prev_page")}
                  </button>
                  <PageJumpControl
                    page={props.page!}
                    totalPages={props.totalPages!}
                    onPageChange={(p) => props.onPageChange!(p)}
                    compact
                  />
                  <button
                    type="button"
                    class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                    disabled={(props.page ?? 1) >= (props.totalPages ?? 1) || props.loading === true}
                    onClick={() => props.onPageChange!(props.page! + 1)}
                  >
                    {uiLabel("reports.next_page")}
                  </button>
                </Show>
              </div>
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
    date_from: localISODate(from),
    date_to: localISODate(to),
  };
}
