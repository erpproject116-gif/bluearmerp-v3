import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type OpsNamedCount = {
  code: string;
  label: string;
  count: number;
  href?: string;
  qty?: number;
};

export type OpsNamedAmount = {
  partner_id?: number;
  partner_name?: string;
  item_code?: string;
  item_name?: string;
  total_amount?: number;
  qty?: number;
};

export type OpsClassifiedDoc = {
  id: number;
  doc_no: string;
  partner_name: string;
  reason_code: string;
  reason_label: string;
  age_days: number;
  amount: number;
  href: string;
};

export type OpsClassifiedBlock = {
  open_headers: number;
  classified_headers: number;
  by_reason: OpsNamedCount[];
  top: OpsClassifiedDoc[];
};

export type OpsFollowUpTop = {
  id: number;
  title: string;
  stage: string;
  due_date: string;
  href: string;
};

export type OpsIntelligence = {
  as_of: string;
  inventory: {
    low_stock: number;
    zero_stock: number;
    serial_mismatch: number;
    reserved_stale: number;
    inbound_trend: { period: string; value: number }[];
    inbound_by_type: OpsNamedCount[];
  };
  sales: {
    mtd: number;
    ytd: number;
    trend: { period: string; value: number }[];
    top_customers: OpsNamedAmount[];
    top_items: OpsNamedAmount[];
  };
  sales_orders: OpsClassifiedBlock;
  purchase_orders: OpsClassifiedBlock;
  purchases: {
    mtd: number;
    gr_unbilled_lines: number;
    gr_billed_lines: number;
    top_vendors: OpsNamedAmount[];
  };
  follow_up: {
    by_stage: OpsNamedCount[];
    by_type: OpsNamedCount[];
    quotes_expiring_7d: number;
    expired_quotes: number;
    pending_approvals: number;
    top: OpsFollowUpTop[];
  };
};

export function useOpsIntelligence(enabled: boolean | (() => boolean) = true) {
  return createQuery(() => ({
    queryKey: ["dashboard-ops-intelligence"],
    enabled: typeof enabled === "function" ? enabled() : enabled,
    queryFn: async () => {
      const res = await apiFetch<OpsIntelligence>("/api/v1/dashboard/ops-intelligence");
      if (!res.success) throw new Error(res.message ?? "Failed to load operations intelligence");
      return res.data!;
    },
    staleTime: 60_000,
  }));
}

export function useInvalidateOpsIntelligence() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["dashboard-ops-intelligence"] });
  };
}
