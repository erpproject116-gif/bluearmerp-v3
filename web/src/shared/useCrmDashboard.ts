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
  scoped_view?: boolean;
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
  customers_with_ar_balance?: number;
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
    refetchInterval: enabled ? 120_000 : false,
    refetchOnWindowFocus: false,
  }));
}

export function useInvalidateCrmDashboard() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-dashboard"] });
}

export type LeadStatusCount = { status: string; count: number };
export type OppStageValue = { stage: string; count: number; expected_value: number };
export type AgingBucket = { bucket: string; count: number };

export type CrmLeadsDashboardSummary = {
  scoped_view?: boolean;
  by_status: LeadStatusCount[];
  open_lead_count: number;
  follow_ups_overdue: number;
  follow_ups_due_soon: number;
  opportunities_by_stage: OppStageValue[];
  aging: AgingBucket[];
};

export function useCrmLeadsDashboard(enabled = true) {
  return createQuery(() => ({
    queryKey: ["crm-dashboard", "leads-summary"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<CrmLeadsDashboardSummary>("/api/v1/crm/dashboard/leads-summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load leads dashboard");
      return (
        res.data ??
        ({
          by_status: [],
          open_lead_count: 0,
          follow_ups_overdue: 0,
          follow_ups_due_soon: 0,
          opportunities_by_stage: [],
          aging: [],
        } as CrmLeadsDashboardSummary)
      );
    },
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
    refetchOnWindowFocus: false,
  }));
}

