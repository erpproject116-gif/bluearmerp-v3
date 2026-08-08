import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SerialAdjustmentFilters = {
  q?: string;
  serial_no?: string;
  status?: string;
  item_id?: number;
  location_id?: number;
  validity_from?: string;
  validity_to?: string;
  inventory_qty?: string;
  include_unassigned?: boolean;
};

export type SerialAdjustmentCandidate = {
  id: number;
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id?: number | null;
  location_name?: string;
  qty_on_hand: number;
  status: string;
};

export type SerialAdjustmentLine = {
  serial_unit_id: number;
  qty_delta: number;
};

function filtersToParams(
  p: { page: number; pageSize: number; sort: string; order: "asc" | "desc" },
  f: SerialAdjustmentFilters,
): string {
  const qs = new URLSearchParams({
    page: String(p.page),
    pageSize: String(p.pageSize),
    sort: p.sort,
    order: p.order,
  });
  if (f.q) qs.set("q", f.q);
  if (f.serial_no) qs.set("serial_no", f.serial_no);
  if (f.status) qs.set("status", f.status);
  if (f.item_id) qs.set("item_id", String(f.item_id));
  if (f.location_id) qs.set("location_id", String(f.location_id));
  if (f.validity_from) qs.set("validity_from", f.validity_from);
  if (f.validity_to) qs.set("validity_to", f.validity_to);
  if (f.inventory_qty) qs.set("inventory_qty", f.inventory_qty);
  if (f.include_unassigned) qs.set("include_unassigned", "1");
  return qs.toString();
}

export function useSerialAdjustmentCandidates(params: () => {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  filters: SerialAdjustmentFilters;
  enabled?: boolean;
}) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToParams(p, p.filters);
    return {
      queryKey: ["serial-adjustment-candidates", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialAdjustmentCandidate[]>(
          `/api/v1/inventory/serial-units/adjustment-candidates?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load serial units");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 30_000,
      placeholderData: (prev: { rows: SerialAdjustmentCandidate[]; total: number } | undefined) => prev,
    };
  });
}

export async function applySerialAdjustments(body: { reason: string; lines: SerialAdjustmentLine[] }) {
  return apiFetch<{ adjusted_count: number; pending_approval?: boolean; request_id?: number }>(
    "/api/v1/inventory/serial-units/adjustments",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}
