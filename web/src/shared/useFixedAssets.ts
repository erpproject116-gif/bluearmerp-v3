import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type FixedAssetStatus = "active" | "fully_depreciated" | "disposed";

export type FixedAsset = {
  id: number;
  asset_code: string;
  asset_name: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  asset_account_code: string;
  depreciation_account_code: string;
  accumulated_depreciation_account_code: string;
  accumulated_depreciation: number;
  monthly_depreciation?: number;
  status: FixedAssetStatus;
  last_depreciation_date?: string | null;
  notes?: string | null;
};

export type DepreciationRun = {
  id: number;
  run_date: string;
  period_year: number;
  period_month: number;
  status: string;
  total_amount: number;
  journal_entry_id?: number | null;
  posted_at?: string | null;
  lines?: DepreciationRunLine[];
};

export type DepreciationRunLine = {
  id: number;
  line_no: number;
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  depreciation_amount: number;
};

export type AssetListParams = {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export function useFixedAssets(params: () => AssetListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    if (p.sort) qs.set("sort", p.sort);
    if (p.order) qs.set("order", p.order);
    return {
      queryKey: ["fixed-assets", p],
      queryFn: async () => {
        const res = await apiFetch<FixedAsset[]>(`/api/v1/fixed-assets/assets?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load assets");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useDepreciationRuns(params: () => { page: number; pageSize: number }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    return {
      queryKey: ["depreciation-runs", p],
      queryFn: async () => {
        const res = await apiFetch<DepreciationRun[]>(`/api/v1/fixed-assets/depreciation-runs?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load runs");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateFixedAssets() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["fixed-assets"] });
    void qc.invalidateQueries({ queryKey: ["depreciation-runs"] });
  };
}

export async function createAsset(body: Record<string, unknown>) {
  return apiFetch<FixedAsset>("/api/v1/fixed-assets/assets", { method: "POST", body: JSON.stringify(body) });
}

export async function patchAsset(id: number, body: Record<string, unknown>) {
  return apiFetch<FixedAsset>(`/api/v1/fixed-assets/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function createDepreciationRun(body: { period_year?: number; period_month?: number }) {
  return apiFetch<DepreciationRun>("/api/v1/fixed-assets/depreciation-runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
