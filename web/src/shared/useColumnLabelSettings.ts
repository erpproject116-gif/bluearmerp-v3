import { createMemo } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ColumnLabelSetting = {
  column_key: string;
  label: string;
  sort_order: number;
  /** Tenant visibility for list and line grids (when column is registered). */
  is_visible?: boolean;
};

export function lineViewKey(entityType: string) {
  return `${entityType}.lines`;
}

export function listViewKey(entityType: string) {
  return `${entityType}.list`;
}

export function applyColumnLabels<T extends { key: string; header: string }>(
  columns: T[],
  columnLabel: (key: string, fallback: string) => string,
): T[] {
  return columns.map((c) => ({ ...c, header: columnLabel(c.key, c.header) }));
}

/** Entity types that support line-column label settings in form settings UI. */
export const LINE_LABEL_ENTITY_TYPES = new Set([
  "quo_quotation",
  "sa_sales",
  "so_sales_order",
  "pr_purchase_request",
  "po_purchase_order",
  "fin_supplier_invoice",
]);

/** Entity types with a registered `*.list` view for data-table column settings. */
export const LIST_COLUMN_ENTITY_TYPES = new Set([
  "fin_supplier_invoice",
  "inv_stock_adjustment",
  "inv_stock_movement",
]);

export function hasLineColumnLabels(entityType: string) {
  return LINE_LABEL_ENTITY_TYPES.has(entityType);
}

export function hasListColumnSettings(entityType: string) {
  return LIST_COLUMN_ENTITY_TYPES.has(entityType);
}

export function columnLabelsQueryKey(viewKey: string) {
  return ["column-label-settings", viewKey] as const;
}

async function fetchColumnLabels(viewKey: string) {
  const res = await apiFetch<{ columns: ColumnLabelSetting[]; can_manage?: boolean }>(
    `/api/v1/column-label-settings?view_key=${encodeURIComponent(viewKey)}`,
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load column labels");
  return res.data ?? { columns: [] };
}

export function useColumnLabelSettings(viewKey: string) {
  const client = useQueryClient();
  const query = createQuery(() => ({
    queryKey: columnLabelsQueryKey(viewKey),
    queryFn: () => fetchColumnLabels(viewKey),
    staleTime: 300_000,
    enabled: Boolean(viewKey),
  }));

  const byKey = createMemo(() => {
    const map: Record<string, ColumnLabelSetting> = {};
    for (const c of query.data?.columns ?? []) map[c.column_key] = c;
    return map;
  });

  const columnLabel = (key: string, fallback: string) => {
    const label = byKey()[key]?.label?.trim();
    return label || fallback;
  };

  const isColumnVisible = (key: string, fallback = true) => {
    const row = byKey()[key];
    if (!row || row.is_visible === undefined) return fallback;
    return row.is_visible;
  };

  const reload = async () => {
    await client.invalidateQueries({ queryKey: columnLabelsQueryKey(viewKey) });
    return client.fetchQuery({
      queryKey: columnLabelsQueryKey(viewKey),
      queryFn: () => fetchColumnLabels(viewKey),
      staleTime: 0,
    });
  };

  const save = async (columns: ColumnLabelSetting[]) => {
    const res = await apiFetch<{ columns: ColumnLabelSetting[] }>(
      `/api/v1/column-label-settings?view_key=${encodeURIComponent(viewKey)}`,
      { method: "PATCH", body: JSON.stringify({ columns }) },
      { successMessage: "Column settings saved." },
    );
    if (!res.success) throw new Error(res.message ?? "Failed to save column settings");
    await reload();
    return res.data?.columns ?? [];
  };

  return {
    query,
    columns: () => query.data?.columns ?? [],
    byKey,
    columnLabel,
    isColumnVisible,
    canManage: () => Boolean(query.data?.can_manage),
    reload,
    save,
  };
}
