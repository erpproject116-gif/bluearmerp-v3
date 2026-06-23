import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type TopItemRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  qty?: number;
  count?: number;
};

export type CrmDashboardSummary = {
  expired_quotations_count: number;
  quotes_expiring_7d: number;
  quotes_not_converted_to_so: number;
  quotes_not_converted_to_sales: number;
  low_stock_sku_count: number;
  top_selling_items: TopItemRow[];
  top_quoted_items: TopItemRow[];
  warranty_follow_ups_due: number;
  unread_notifications_count: number;
  quotes_missing_validity_count?: number;
  ar_customers_with_balance?: number;
};

export function useCrmDashboard(enabled = true) {
  return createQuery(() => ({
    queryKey: ["crm-dashboard"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<CrmDashboardSummary>("/api/v1/crm/dashboard/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load CRM dashboard");
      return res.data ?? ({} as CrmDashboardSummary);
    },
    staleTime: 60_000,
    refetchInterval: enabled ? 60_000 : false,
  }));
}

export function useInvalidateCrmDashboard() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-dashboard"] });
}
