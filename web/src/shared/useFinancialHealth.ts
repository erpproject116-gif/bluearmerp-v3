import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type FinancialHealthCashMonth = {
  period: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type FinancialHealthAging = {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total: number;
  overdue: number;
};

export type OverdueInvoiceAlert = {
  sales_id: number;
  sales_no: string;
  customer_name: string;
  due_date: string;
  balance: number;
  age_days: number;
  age_bucket: string;
};

export type FinancialHealthPipeline = {
  open_opportunities: number;
  weighted_pipeline_value: number;
  expected_pipeline_value: number;
  follow_ups_due: number;
  open_quotations_value: number;
  quotes_expiring_7d: number;
};

export type ProfitRow = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  txn_count?: number;
  item_id?: number | null;
  project_id?: number | null;
};

export type RecurringRow = {
  id: number;
  name: string;
  category: string;
  vendor_name: string;
  amount: number;
  frequency: string;
  monthly_equiv: number;
  next_due_date?: string | null;
  is_active: boolean;
};

export type FinancialHealth = {
  as_of: string;
  cash: {
    inflow_ytd: number;
    outflow_ytd: number;
    net_ytd: number;
    inflow_mtd: number;
    outflow_mtd: number;
    net_mtd: number;
    months: FinancialHealthCashMonth[];
  };
  receivables: FinancialHealthAging;
  payables: FinancialHealthAging;
  overdue_alerts: OverdueInvoiceAlert[];
  overdue_alert_count: number;
  pipeline: FinancialHealthPipeline;
  profit_by_product: ProfitRow[];
  profit_by_project: ProfitRow[];
  recurring: {
    monthly_burn: number;
    yearly_burn: number;
    active_count: number;
    items: RecurringRow[];
  };
};

export function useFinancialHealth(enabled = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-financial-health"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<FinancialHealth>("/api/v1/dashboard/financial-health");
      if (!res.success) throw new Error(res.message ?? "Failed to load financial health");
      return res.data!;
    },
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
    refetchOnWindowFocus: false,
  }));
}
