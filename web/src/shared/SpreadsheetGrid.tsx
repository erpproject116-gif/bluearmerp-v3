import { type JSX, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { A, useLocation } from "@solidjs/router";
import {
  downloadItemsImportTemplate,
  importItemsCsv,
} from "./itemsCsvImport";
import { DataTableScroll, ResizableTd, ResizableTh } from "./ResizableTable";
import { useResizableColumns } from "./useResizableColumns";
import { useToast } from "./toast";
import { brandingPlaceholder } from "./branding/brandingStore";
import { uiLabel } from "./branding/uiLabel";
import { GridExportButtons, type GridExportColumn } from "./gridExport";
import { useGridColumnPrefs } from "./useGridColumnPrefs";
import { PageJumpControl } from "./PageJumpControl";

const NON_HIDEABLE_KEYS = new Set(["actions", "print", "history", "lifecycle", "date_no_display"]);

function defaultColumnHideable(key: string, explicit?: boolean): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  return !NON_HIDEABLE_KEYS.has(key);
}

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => JSX.Element;
  /** Plain value for CSV/Excel/print export when render is complex. */
  exportValue?: (row: T) => string | number;
  clickable?: boolean;
  sortable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  /** When false, column cannot be hidden via Columns picker. Default true. */
  hideable?: boolean;
};

type Props<T extends { id: number }> = {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Enable multi-select checkboxes (independent of selectedId highlight). */
  selectable?: boolean;
  selectedIds?: Set<number> | number[];
  onSelectionChange?: (ids: Set<number>) => void;
  onEdit: (row: T) => void;
  onNew: () => void;
  /** Override default “New row” button label (e.g. “New sales”). */
  newLabel?: string;
  showNew?: boolean;
  codeKey: keyof T & string;
  nameKey: keyof T & string;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  /** Delay before applying search to the list query. Default 2000ms. Enter commits immediately. */
  searchDebounceMs?: number;
  status?: string;
  onStatusChange?: (status: string) => void;
  statusLabel?: string;
  statusOptions?: { value: string; label: string }[];
  onRefresh?: () => void;
  settingsHref?: string;
  toolbarExtra?: JSX.Element;
  itemsCsvImport?: boolean;
  onImportComplete?: () => void;
  /** When set, shows Print / CSV / Excel / PDF. Defaults to "data-export" so lists always exportable. */
  exportFilename?: string | false;
  exportTitle?: string;
  /** Force-hide export controls (overrides default). */
  hideExport?: boolean;
  /**
   * Personal Columns picker persistence key (`bluearm:grid.columns:{key}`).
   * - omit / undefined: auto key from route + column keys (enabled on all lists)
   * - string: explicit key (e.g. tenant list-view settings)
   * - false: disable Columns picker for this grid
   */
  columnPrefsKey?: string | false;
};

function selectionSet(ids?: Set<number> | number[]): Set<number> {
  if (!ids) return new Set<number>();
  return ids instanceof Set ? ids : new Set(ids);
}

export function SpreadsheetGrid<T extends { id: number }>(props: Props<T>) {
  const location = useLocation();
  const [focusIdx, setFocusIdx] = createSignal(0);
  const [importing, setImporting] = createSignal(false);
  const [columnsMenuOpen, setColumnsMenuOpen] = createSignal(false);
  const toast = useToast();
  let fileInputEl: HTMLInputElement | undefined;
  let columnsMenuEl: HTMLDivElement | undefined;

  const resolvedColumnPrefsKey = createMemo(() => {
    if (props.columnPrefsKey === false) return undefined;
    if (typeof props.columnPrefsKey === "string" && props.columnPrefsKey.trim()) {
      return props.columnPrefsKey.trim();
    }
    const colKeys = props.columns.map((c) => c.key).join("|");
    return `route:${location.pathname}:${colKeys}`;
  });

  const columnPrefs = useGridColumnPrefs(
    () => resolvedColumnPrefsKey(),
    () =>
      props.columns.map((c) => ({
        key: c.key,
        header: c.header,
        hideable: defaultColumnHideable(c.key, c.hideable),
      })),
  );

  const activeColumns = createMemo(() => {
    if (!columnPrefs.enabled()) return props.columns;
    const visibleKeys = new Set(columnPrefs.visibleColumns().map((c) => c.key));
    return props.columns.filter((c) => visibleKeys.has(c.key));
  });

  // Local draft so typing stays responsive; only the committed query (props.search / onSearchChange)
  // refetches the table after debounce — not a full page reload.
  const [searchDraft, setSearchDraft] = createSignal(props.search ?? "");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEmittedSearch = props.search ?? "";

  // Keep last rows visible only while a refetch is in flight (avoid empty flash).
  // When loading finishes, always sync — including empty results after create/delete.
  const [staleRows, setStaleRows] = createSignal<T[]>(props.rows);
  const [staleTotal, setStaleTotal] = createSignal<number | undefined>(props.total);

  createEffect(() => {
    const loading = !!props.loading;
    const rows = props.rows;
    const total = props.total;
    if (!loading) {
      setStaleRows(rows);
      if (total !== undefined) setStaleTotal(total);
      return;
    }
    if (rows.length > 0) setStaleRows(rows);
    if (total !== undefined) setStaleTotal(total);
  });

  const displayRows = createMemo(() => {
    const rows = props.rows;
    if (rows.length > 0) return rows;
    if (props.loading && staleRows().length > 0) return staleRows();
    return rows;
  });

  const displayTotal = createMemo(() => {
    const total = props.total;
    if (total !== undefined) return total;
    if (props.loading) return staleTotal();
    return total;
  });

  createEffect(() => {
    const external = props.search ?? "";
    if (external !== lastEmittedSearch) {
      lastEmittedSearch = external;
      setSearchDraft(external);
    }
  });

  onCleanup(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  const commitSearch = (value: string) => {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
    lastEmittedSearch = value;
    props.onSearchChange?.(value);
  };

  const onSearchInput = (value: string) => {
    setSearchDraft(value);
    if (searchTimer) clearTimeout(searchTimer);
    const ms = props.searchDebounceMs ?? 2000;
    searchTimer = setTimeout(() => commitSearch(value), ms);
  };

  const isInitialLoading = () =>
    !!props.loading && props.rows.length === 0 && displayRows().length === 0;
  const isRefreshing = () => !!props.loading && displayRows().length > 0;

  const columnDefs = () =>
    activeColumns().map((c) => ({
      key: c.key,
      width: c.width,
      minWidth: c.minWidth,
      maxWidth: c.maxWidth,
    }));
  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(columnDefs);

  const selectedIdSet = createMemo(() => selectionSet(props.selectedIds));

  const pageRowIds = createMemo(() => displayRows().map((r) => r.id));

  const pageAllSelected = createMemo(() => {
    const ids = pageRowIds();
    if (ids.length === 0) return false;
    const sel = selectedIdSet();
    return ids.every((id) => sel.has(id));
  });

  const pageSomeSelected = createMemo(() => {
    const ids = pageRowIds();
    if (ids.length === 0) return false;
    const sel = selectedIdSet();
    return ids.some((id) => sel.has(id)) && !pageAllSelected();
  });

  const toggleRowSelected = (id: number, checked: boolean) => {
    const next = new Set(selectedIdSet());
    if (checked) next.add(id);
    else next.delete(id);
    props.onSelectionChange?.(next);
  };

  const togglePageSelected = (checked: boolean) => {
    const next = new Set(selectedIdSet());
    for (const id of pageRowIds()) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    props.onSelectionChange?.(next);
  };

  let headerSelectEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (headerSelectEl) headerSelectEl.indeterminate = pageSomeSelected();
  });

  const handleImportFile = async (file: File) => {
    if (!props.itemsCsvImport) return;
    setImporting(true);
    try {
      const result = await importItemsCsv(file);
      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Import failed.");
        return;
      }
      const { created, failed, row_errors: rowErrors } = result.data;
      if (failed > 0) {
        const detail =
          rowErrors
            ?.slice(0, 8)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join(" · ") ?? "";
        toast.warning(`Imported ${created} row(s); ${failed} failed.${detail ? ` ${detail}` : ""}`);
      } else if (created > 0) {
        toast.success(`Imported ${created} item(s).`);
      } else {
        toast.warning("No rows were imported.");
      }
      if (created > 0) {
        props.onImportComplete?.();
      }
    } catch {
      toast.error("Import failed.");
    } finally {
      setImporting(false);
      if (fileInputEl) fileInputEl.value = "";
    }
  };

  createEffect(() => {
    const rows = displayRows();
    if (rows.length === 0) setFocusIdx(0);
    else if (focusIdx() >= rows.length) setFocusIdx(rows.length - 1);
  });

  const totalPages = () => {
    const total = displayTotal() ?? 0;
    const size = props.pageSize ?? 1;
    return Math.max(1, Math.ceil(total / size));
  };

  const rangeStart = () => {
    const total = displayTotal();
    if (!total || total === 0) return 0;
    return ((props.page ?? 1) - 1) * (props.pageSize ?? displayRows().length) + 1;
  };

  const rangeEnd = () => {
    const total = displayTotal();
    if (!total || total === 0) return 0;
    return Math.min((props.page ?? 1) * (props.pageSize ?? displayRows().length), total);
  };

  onMount(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "F2") {
        e.preventDefault();
        props.onNew();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, Math.max(0, displayRows().length - 1)));
        const row = displayRows()[focusIdx()];
        if (row) props.onSelect(row.id);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
        const row = displayRows()[focusIdx()];
        if (row) props.onSelect(row.id);
      }
      if (e.key === "Enter") {
        const row = displayRows()[focusIdx()];
        if (row) {
          e.preventDefault();
          props.onEdit(row);
        }
      }
      if (e.key === "Escape") setColumnsMenuOpen(false);
    };
    const onDocClick = (e: MouseEvent) => {
      if (!columnsMenuOpen()) return;
      const t = e.target;
      if (t instanceof Node && columnsMenuEl?.contains(t)) return;
      setColumnsMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    });
  });

  return (
    <div class="overflow-hidden rounded-xl border border-stroke erp-surface shadow-sm">
      <div class="border-b border-stroke px-5 py-4">
        <div class="flex flex-wrap items-end gap-3">
          <Show when={props.onStatusChange}>
            <label class="shrink-0">
              <span class="mb-1 block text-xs font-medium text-text-primary">{props.statusLabel ?? uiLabel("common.status")}</span>
              <select
                class={toolbarControlClass}
                value={props.status ?? ""}
                onChange={(e) => props.onStatusChange?.(e.currentTarget.value)}
              >
                <For each={props.statusOptions ?? [
                  { value: "active", label: uiLabel("common.status_active") },
                  { value: "inactive", label: uiLabel("common.status_inactive") },
                  { value: "", label: uiLabel("common.status_all") },
                ]}>
                  {(opt) => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
            </label>
          </Show>
          <Show when={props.onSearchChange}>
            <label class="relative min-w-[200px] flex-1 sm:max-w-xs">
              <span class="mb-1 block text-xs font-medium text-text-primary">{uiLabel("common.search")}</span>
              <div class="relative">
                <svg
                  class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path stroke-linecap="round" d="M20 20l-3-3" />
                </svg>
                <input
                  type="search"
                  class={`${toolbarControlClass} w-full pl-9`}
                  placeholder={props.searchPlaceholder ?? brandingPlaceholder("search.item", "Search…")}
                  value={searchDraft()}
                  onInput={(e) => onSearchInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitSearch(searchDraft());
                    }
                  }}
                />
              </div>
            </label>
          </Show>
          <div class="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 pb-0.5">
            <Show when={!props.hideExport && props.exportFilename !== false}>
              <GridExportButtons
                title={props.exportTitle ?? String(props.exportFilename || "Export")}
                filename={typeof props.exportFilename === "string" && props.exportFilename ? props.exportFilename : "data-export"}
                columns={activeColumns()
                  .filter((c) => c.key !== "actions" && c.key !== "id" && c.header !== "")
                  .map(
                    (c): GridExportColumn => ({
                      key: c.key,
                      header: c.header,
                      value: (row) => {
                        const typed = row as unknown as T;
                        if (c.exportValue) return c.exportValue(typed);
                        const raw = (typed as Record<string, unknown>)[c.key];
                        if (raw == null) return "";
                        if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw);
                        return String(raw);
                      },
                    }),
                  )}
                rows={() => displayRows() as unknown as Record<string, unknown>[]}
              />
            </Show>
            <Show when={columnPrefs.enabled()}>
              <div class="relative" ref={(el) => (columnsMenuEl = el)}>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                  aria-expanded={columnsMenuOpen()}
                  aria-haspopup="true"
                  onClick={() => setColumnsMenuOpen((o) => !o)}
                >
                  Columns
                </button>
                <Show when={columnsMenuOpen()}>
                  <div class="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-stroke bg-white p-3 shadow-lg">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Show columns</p>
                      <button
                        type="button"
                        class="text-xs font-medium text-brand-600 hover:underline"
                        onClick={() => columnPrefs.showAll()}
                      >
                        Show all
                      </button>
                    </div>
                    <ul class="max-h-64 space-y-1.5 overflow-y-auto">
                      <For each={columnPrefs.hideableColumns()}>
                        {(c) => (
                          <li>
                            <label class="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                              <input
                                type="checkbox"
                                class="h-4 w-4 rounded border-stroke"
                                checked={!columnPrefs.isHidden(c.key)}
                                onChange={(e) => columnPrefs.setColumnVisible(c.key, e.currentTarget.checked)}
                              />
                              <span class="truncate">{c.header || c.key}</span>
                            </label>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </Show>
              </div>
            </Show>
            {props.toolbarExtra}
            <Show when={props.itemsCsvImport}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                disabled={importing()}
                onClick={() => void downloadItemsImportTemplate()}
              >
                {uiLabel("common.download_template")}
              </button>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary disabled:opacity-50"
                disabled={importing()}
                onClick={() => fileInputEl?.click()}
              >
                {importing() ? uiLabel("common.importing") : uiLabel("common.import_csv")}
              </button>
              <input
                ref={fileInputEl}
                type="file"
                accept=".csv,text/csv"
                class="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void handleImportFile(file);
                }}
              />
            </Show>
            <Show when={props.onRefresh}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                onClick={() => props.onRefresh?.()}
              >
                {uiLabel("common.refresh")}
              </button>
            </Show>
            <Show when={props.settingsHref}>
              <A
                href={props.settingsHref!}
                class="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-stroke text-text-secondary transition hover:erp-panel hover:text-brand-600"
                title="Form settings"
                aria-label="Form settings"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </A>
            </Show>
            <Show when={props.showNew !== false}>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              onClick={() => props.onNew()}
            >
              {props.newLabel ?? uiLabel("common.new_row")}
            </button>
            </Show>
          </div>
        </div>
      </div>
      <Show when={isInitialLoading()}>
        <p class="p-8 text-center text-sm text-text-secondary">{uiLabel("common.loading")}</p>
      </Show>
      <Show when={!isInitialLoading()}>
        <div class="relative">
          <Show when={isRefreshing()}>
            <div class="pointer-events-none absolute inset-0 z-[2] bg-white/40" aria-hidden="true" />
          </Show>
          <DataTableScroll maxHeight="calc(100vh - 16rem)">
          <table
            class="erp-grid text-left text-sm"
            style={{ width: `${tableWidth()}px`, "min-width": "100%" }}
          >
            <thead class="erp-panel sticky top-0 z-[1]">
              <tr>
                <Show when={props.selectable}>
                  <th class="w-10 px-3 py-3" scope="col">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-stroke"
                      checked={pageAllSelected()}
                      ref={(el) => {
                        headerSelectEl = el;
                      }}
                      aria-label="Select all rows on this page"
                      onChange={(e) => togglePageSelected(e.currentTarget.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                </Show>
                {activeColumns().map((c) => {
                  const sortable = c.sortable !== false && Boolean(props.onSort);
                  const active = props.sortKey === c.key;
                  return (
                    <ResizableTh
                      columnKey={c.key}
                      width={widthFor(c.key)}
                      onResizeStart={onResizeStart}
                      resizable={c.resizable !== false}
                      class={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary${
                        sortable ? " cursor-pointer select-none hover:text-brand-600" : ""
                      }${active ? " text-brand-600" : ""}`}
                      onClick={() => sortable && props.onSort?.(c.key)}
                    >
                      <span class="inline-flex items-center gap-1">
                        {c.header}
                        <Show when={active}>
                          <span aria-hidden="true">{props.sortOrder === "asc" ? "↑" : "↓"}</span>
                        </Show>
                      </span>
                    </ResizableTh>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayRows().map((row, idx) => (
                <tr
                  class="cursor-pointer transition hover:erp-panel"
                  classList={{ "bg-brand-50": idx === focusIdx() || props.selectedId === row.id }}
                  onClick={() => {
                    setFocusIdx(idx);
                    props.onSelect(row.id);
                  }}
                  onDblClick={() => props.onEdit(row)}
                >
                  <Show when={props.selectable}>
                    <td class="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-stroke"
                        checked={selectedIdSet().has(row.id)}
                        aria-label={`Select row ${row.id}`}
                        onChange={(e) => toggleRowSelected(row.id, e.currentTarget.checked)}
                      />
                    </td>
                  </Show>
                  {activeColumns().map((c) => {
                    const val = (row as Record<string, unknown>)[c.key];
                    const clickable = c.clickable ?? (c.key === props.codeKey || c.key === props.nameKey);
                    const cellContent = c.render ? c.render(row) : String(val ?? "");
                    return (
                      <ResizableTd
                        width={widthFor(c.key)}
                        class={`px-5 py-3${
                          clickable
                            ? " cursor-pointer font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
                            : " text-text-primary"
                        }`}
                        onClick={(e) => {
                          if (clickable) {
                            e.stopPropagation();
                            props.onEdit(row);
                          }
                        }}
                      >
                        {clickable && c.render ? (
                          <span class="text-brand-600 hover:text-brand-700">{cellContent}</span>
                        ) : (
                          cellContent
                        )}
                      </ResizableTd>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <Show when={displayRows().length === 0 && !props.loading}>
            <p class="p-8 text-center text-sm text-text-secondary">{uiLabel("common.no_rows")}</p>
          </Show>
        </DataTableScroll>
        </div>
        <Show when={displayTotal() !== undefined && props.page !== undefined && props.pageSize !== undefined}>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3">
            <span class="text-sm text-text-secondary">
              {displayTotal() === 0
                ? uiLabel("common.no_results")
                : `Showing ${rangeStart()}–${rangeEnd()} of ${displayTotal()}`}
              <Show when={isRefreshing()}>
                <span class="ml-2 text-brand-600">{uiLabel("common.updating")}</span>
              </Show>
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={(props.page ?? 1) <= 1}
                onClick={() => props.onPageChange?.((props.page ?? 1) - 1)}
              >
                {uiLabel("common.previous")}
              </button>
              <Show when={props.onPageChange}>
                <PageJumpControl
                  page={props.page ?? 1}
                  totalPages={totalPages()}
                  onPageChange={(p) => props.onPageChange?.(p)}
                />
              </Show>
              <Show when={!props.onPageChange}>
                <span class="text-sm text-text-secondary">
                  Page {props.page} of {totalPages()}
                </span>
              </Show>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={(props.page ?? 1) >= totalPages()}
                onClick={() => props.onPageChange?.((props.page ?? 1) + 1)}
              >
                {uiLabel("common.next")}
              </button>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}

export function EntityModal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  wide?: boolean;
  singleColumn?: boolean;
  /** Render above another modal (e.g. email over a transaction window). */
  stacked?: boolean;
  /** Primary action label (default: Save changes). */
  saveLabel?: string;
  /** Optional secondary action (e.g. Save draft). */
  secondarySaveLabel?: string;
  onSecondarySave?: () => void;
  /** Optional controls at the right of the title (e.g. History). */
  headerActions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <Portal>
        <div
          class={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:items-center ${props.stacked ? "z-[70]" : "z-50"}`}
        >
          <div
            class="erp-surface w-full rounded-2xl border border-stroke p-6 shadow-xl"
            classList={{ "max-w-6xl": props.wide, "max-w-4xl": !props.wide }}
          >
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
              <Show when={props.headerActions}>
                <div class="flex items-center gap-2">{props.headerActions}</div>
              </Show>
            </div>
            <div
              class="mt-5"
              classList={{
                "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3": !props.singleColumn,
              }}
            >
              {props.children}
            </div>
            <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
                onClick={() => props.onClose()}
              >
                Cancel
              </button>
              <Show when={props.secondarySaveLabel && props.onSecondarySave}>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:erp-panel disabled:opacity-50"
                  disabled={props.saving}
                  onClick={() => props.onSecondarySave?.()}
                >
                  {props.secondarySaveLabel}
                </button>
              </Show>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={props.saving}
                aria-busy={props.saving ? "true" : "false"}
                onClick={() => props.onSave()}
              >
                {props.saving ? "Saving…" : (props.saveLabel ?? "Save changes")}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export function Field(props: { label: string | JSX.Element; span?: "full"; children: JSX.Element }) {
  return (
    <label class={props.span === "full" ? "col-span-full block" : "block"}>
      <span class="mb-1 block text-sm font-medium" style={{ color: "var(--color-label, var(--color-text-primary))" }}>
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

export function ModalMessage(props: { children: JSX.Element }) {
  return <div class="col-span-full">{props.children}</div>;
}

export const inputClass =
  "erp-input w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition";

export const toolbarControlClass =
  "erp-input rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition";
