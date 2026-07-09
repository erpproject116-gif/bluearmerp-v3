import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type LotAdjustmentCandidate = {
  id: number;
  lot_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  expiry_date?: string | null;
};

export type LotAdjustmentFilters = {
  q?: string;
  item_id?: number;
  location_id?: number;
};

type ListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  filters: LotAdjustmentFilters;
  enabled?: boolean;
};

export function useLotAdjustmentCandidates(params: () => ListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.filters.q) qs.set("q", p.filters.q);
    if (p.filters.item_id) qs.set("item_id", String(p.filters.item_id));
    if (p.filters.location_id) qs.set("location_id", String(p.filters.location_id));
    return {
      queryKey: ["lot-adjustment-candidates", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<LotAdjustmentCandidate[]>(
          `/api/v1/inventory/lot-batches/adjustment-candidates?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load lots");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 10_000,
    };
  });
}

export async function applyLotAdjustments(body: {
  reason: string;
  lines: { lot_batch_id: number; qty_delta: number }[];
}) {
  return apiFetch<{ adjusted_count: number }>("/api/v1/inventory/lot-batches/adjustments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function registerLotBatch(body: {
  item_id: number;
  lot_no: string;
  location_id: number;
  qty: number;
  expiry_date?: string | null;
}) {
  return apiFetch<{ id: number; lot_no: string }>("/api/v1/inventory/lot-batches/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
