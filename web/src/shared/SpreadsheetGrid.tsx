import { type JSX, For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";
import {
  downloadItemsImportTemplate,
  importItemsCsv,
} from "./itemsCsvImport";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => JSX.Element;
  clickable?: boolean;
  sortable?: boolean;
};

type Props<T extends { id: number }> = {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEdit: (row: T) => void;
  onNew: () => void;
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
  status?: string;
  onStatusChange?: (status: string) => void;
  statusLabel?: string;
  statusOptions?: { value: string; label: string }[];
  onRefresh?: () => void;
  settingsHref?: string;
  itemsCsvImport?: boolean;
  onImportComplete?: () => void;
};

export function SpreadsheetGrid<T extends { id: number }>(props: Props<T>) {
  const [focusIdx, setFocusIdx] = createSignal(0);
  const [importing, setImporting] = createSignal(false);
  let fileInputEl: HTMLInputElement | undefined;

  const handleImportFile = async (file: File) => {
    if (!props.itemsCsvImport) return;
    setImporting(true);
    try {
      const result = await importItemsCsv(file);
      if (!result.ok || !result.data) {
        alert(result.message ?? "Import failed.");
        return;
      }
      const { created, failed, row_errors: rowErrors } = result.data;
      if (failed > 0) {
        const detail =
          rowErrors
            ?.slice(0, 8)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join("\n") ?? "";
        alert(`Imported ${created} row(s); ${failed} failed.\n${detail}`);
      }
      if (created > 0) {
        props.onImportComplete?.();
      }
    } catch {
      alert("Import failed.");
    } finally {
      setImporting(false);
      if (fileInputEl) fileInputEl.value = "";
    }
  };

  createEffect(() => {
    if (props.rows.length === 0) setFocusIdx(0);
    else if (focusIdx() >= props.rows.length) setFocusIdx(props.rows.length - 1);
  });

  const totalPages = () => {
    const total = props.total ?? 0;
    const size = props.pageSize ?? 1;
    return Math.max(1, Math.ceil(total / size));
  };

  const rangeStart = () => {
    if (!props.total || props.total === 0) return 0;
    return ((props.page ?? 1) - 1) * (props.pageSize ?? props.rows.length) + 1;
  };

  const rangeEnd = () => {
    if (!props.total || props.total === 0) return 0;
    return Math.min((props.page ?? 1) * (props.pageSize ?? props.rows.length), props.total);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        props.onNew();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, Math.max(0, props.rows.length - 1)));
        const row = props.rows[focusIdx()];
        if (row) props.onSelect(row.id);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
        const row = props.rows[focusIdx()];
        if (row) props.onSelect(row.id);
      }
      if (e.key === "Enter") {
        const row = props.rows[focusIdx()];
        if (row) {
          e.preventDefault();
          props.onEdit(row);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div class="overflow-hidden rounded-xl border border-stroke bg-white shadow-sm">
      <div class="border-b border-stroke px-5 py-4">
        <div class="flex flex-wrap items-end gap-3">
          <Show when={props.onStatusChange}>
            <label class="shrink-0">
              <span class="mb-1 block text-xs font-medium text-text-primary">{props.statusLabel ?? "Status"}</span>
              <select
                class={toolbarControlClass}
                value={props.status ?? ""}
                onChange={(e) => props.onStatusChange?.(e.currentTarget.value)}
              >
                <For each={props.statusOptions ?? [
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "", label: "All" },
                ]}>
                  {(opt) => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
            </label>
          </Show>
          <Show when={props.onSearchChange}>
            <label class="relative min-w-[200px] flex-1 sm:max-w-xs">
              <span class="mb-1 block text-xs font-medium text-text-primary">Search</span>
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
                  placeholder={props.searchPlaceholder ?? "Search…"}
                  value={props.search ?? ""}
                  onInput={(e) => props.onSearchChange?.(e.currentTarget.value)}
                />
              </div>
            </label>
          </Show>
          <span class="hidden flex-1 pb-2 text-sm text-text-secondary lg:inline">F2 new · ↑↓ navigate · Enter edit · click headers to sort</span>
          <div class="ml-auto flex shrink-0 items-center gap-2 pb-0.5">
            <Show when={props.itemsCsvImport}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
                disabled={importing()}
                onClick={() => void downloadItemsImportTemplate()}
              >
                Download template
              </button>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50 hover:text-text-primary disabled:opacity-50"
                disabled={importing()}
                onClick={() => fileInputEl?.click()}
              >
                {importing() ? "Importing…" : "Import CSV"}
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
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
                onClick={() => props.onRefresh?.()}
              >
                Refresh
              </button>
            </Show>
            <Show when={props.settingsHref}>
              <A
                href={props.settingsHref!}
                class="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-stroke text-text-secondary transition hover:bg-slate-50 hover:text-brand-600"
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
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              onClick={() => props.onNew()}
            >
              + New row
            </button>
          </div>
        </div>
      </div>
      <Show when={props.loading && props.rows.length === 0}>
        <p class="p-8 text-center text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={!props.loading || props.rows.length > 0}>
        <div class="max-h-[calc(100vh-16rem)] overflow-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="sticky top-0 border-b border-stroke bg-slate-50">
              <tr>
                {props.columns.map((c) => {
                  const sortable = c.sortable !== false && Boolean(props.onSort);
                  const active = props.sortKey === c.key;
                  return (
                    <th
                      class="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
                      classList={{
                        "cursor-pointer select-none hover:text-brand-600": sortable,
                        "text-brand-600": active,
                      }}
                      onClick={() => sortable && props.onSort?.(c.key)}
                    >
                      <span class="inline-flex items-center gap-1">
                        {c.header}
                        <Show when={active}>
                          <span aria-hidden="true">{props.sortOrder === "asc" ? "↑" : "↓"}</span>
                        </Show>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, idx) => (
                <tr
                  class="cursor-pointer border-b border-stroke/60 transition hover:bg-slate-50"
                  classList={{ "bg-brand-50": idx === focusIdx() || props.selectedId === row.id }}
                  onClick={() => {
                    setFocusIdx(idx);
                    props.onSelect(row.id);
                  }}
                  onDblClick={() => props.onEdit(row)}
                >
                  {props.columns.map((c) => {
                    const val = (row as Record<string, unknown>)[c.key];
                    const clickable = c.clickable ?? (c.key === props.codeKey || c.key === props.nameKey);
                    const cellContent = c.render ? c.render(row) : String(val ?? "");
                    return (
                      <td
                        class="px-5 py-3"
                        classList={{
                          "cursor-pointer font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline": clickable,
                          "text-text-primary": !clickable,
                        }}
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
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <Show when={props.rows.length === 0 && !props.loading}>
            <p class="p-8 text-center text-sm text-text-secondary">No rows yet. Press F2 to create one.</p>
          </Show>
        </div>
        <Show when={props.total !== undefined && props.page !== undefined && props.pageSize !== undefined}>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3">
            <span class="text-sm text-text-secondary">
              {props.total === 0
                ? "No results"
                : `Showing ${rangeStart()}–${rangeEnd()} of ${props.total}`}
              <Show when={props.loading}>
                <span class="ml-2 text-brand-600">Updating…</span>
              </Show>
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={(props.page ?? 1) <= 1}
                onClick={() => props.onPageChange?.((props.page ?? 1) - 1)}
              >
                Previous
              </button>
              <span class="text-sm text-text-secondary">
                Page {props.page} of {totalPages()}
              </span>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={(props.page ?? 1) >= totalPages()}
                onClick={() => props.onPageChange?.((props.page ?? 1) + 1)}
              >
                Next
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
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 sm:items-center">
        <div class="w-full max-w-4xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
          <div class="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{props.children}</div>
          <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
              onClick={() => props.onClose()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={props.saving}
              onClick={() => props.onSave()}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function Field(props: { label: string; span?: "full"; children: JSX.Element }) {
  return (
    <label class={props.span === "full" ? "col-span-full block" : "block"}>
      <span class="mb-1 block text-sm font-medium text-text-primary">{props.label}</span>
      {props.children}
    </label>
  );
}

export function ModalMessage(props: { children: JSX.Element }) {
  return <div class="col-span-full">{props.children}</div>;
}

export const inputClass =
  "w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-text-primary shadow-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-50";

export const toolbarControlClass =
  "rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-text-primary shadow-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-50";
