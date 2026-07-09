import { createMemo } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ColumnLabelSetting = {
  column_key: string;
  label: string;
  sort_order: number;
};

export function lineViewKey(entityType: string) {
  return `${entityType}.lines`;
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

export function hasLineColumnLabels(entityType: string) {
  return LINE_LABEL_ENTITY_TYPES.has(entityType);
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
      { successMessage: "Column labels saved." },
    );
    if (!res.success) throw new Error(res.message ?? "Failed to save column labels");
    await reload();
    return res.data?.columns ?? [];
  };

  return {
    query,
    columns: () => query.data?.columns ?? [],
    byKey,
    columnLabel,
    canManage: () => Boolean(query.data?.can_manage),
    reload,
    save,
  };
}
