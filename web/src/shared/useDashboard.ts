import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type DashboardSummary = {
  sales_mtd: number;
  sales_ytd: number;
  low_stock_count: number;
  ar_customers: number;
  open_po_lines: number;
  warranty_due: number;
  expired_quotes: number;
  quotes_expiring_7d: number;
};

export type DashboardTrendPoint = {
  period: string;
  value: number;
};

export type DashboardTrend = {
  months: number;
  points: DashboardTrendPoint[];
};

export type DashboardTopCustomer = {
  partner_id: number;
  partner_name: string;
  total_amount: number;
};

export type DashboardTopVendor = {
  partner_id: number;
  partner_name: string;
  total_amount: number;
};

export type DashboardTopItem = {
  item_id?: number | null;
  item_code: string;
  item_name: string;
  qty: number;
};

export type DashboardRedFlagCategory = {
  code: string;
  label: string;
  count: number;
};

export type DashboardRedFlags = {
  total_count: number;
  categories: DashboardRedFlagCategory[];
};

export function useDashboardSummary(enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-summary"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardSummary>("/api/v1/dashboard/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load dashboard summary");
      return res.data ?? ({} as DashboardSummary);
    },
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  }));
}

export function useDashboardSalesTrend(months = 12, enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-sales-trend", months],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardTrend>(`/api/v1/dashboard/sales-trend?months=${months}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load sales trend");
      return res.data ?? { months, points: [] };
    },
    staleTime: 60_000,
  }));
}

export function useDashboardInventoryTrend(months = 12, enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-inventory-trend", months],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardTrend>(`/api/v1/dashboard/inventory-trend?months=${months}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load inventory trend");
      return res.data ?? { months, points: [] };
    },
    staleTime: 60_000,
  }));
}

export function useDashboardTopCustomers(days = 90, limit = 10, enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-top-customers", days, limit],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardTopCustomer[]>(
        `/api/v1/dashboard/top-customers?days=${days}&limit=${limit}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load top customers");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useDashboardTopVendors(days = 90, limit = 10, enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-top-vendors", days, limit],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardTopVendor[]>(
        `/api/v1/dashboard/top-vendors?days=${days}&limit=${limit}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load top vendors");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useDashboardTopItems(days = 90, limit = 10, enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-top-items", days, limit],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardTopItem[]>(`/api/v1/dashboard/top-items?days=${days}&limit=${limit}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load top items");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useDashboardRedFlags(enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-red-flags"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<DashboardRedFlags>("/api/v1/dashboard/red-flags");
      if (!res.success) throw new Error(res.message ?? "Failed to load red flags");
      return res.data ?? { total_count: 0, categories: [] };
    },
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  }));
}

export function useInvalidateDashboard() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["dashboard-summary"] });
    void client.invalidateQueries({ queryKey: ["dashboard-sales-trend"] });
    void client.invalidateQueries({ queryKey: ["dashboard-inventory-trend"] });
    void client.invalidateQueries({ queryKey: ["dashboard-top-customers"] });
    void client.invalidateQueries({ queryKey: ["dashboard-top-vendors"] });
    void client.invalidateQueries({ queryKey: ["dashboard-top-items"] });
    void client.invalidateQueries({ queryKey: ["dashboard-red-flags"] });
  };
}
