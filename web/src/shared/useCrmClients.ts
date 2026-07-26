import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ClientHealthRow = {
  partner_id: number;
  partner_code: string;
  company_name: string;
  open_ar_balance: number;
  credit_limit?: number | null;
  credit_limit_on_hold: boolean;
  open_follow_ups: number;
  overdue_follow_ups: number;
  open_work_items: number;
  overdue_work_items: number;
  last_activity_date?: string | null;
  days_since_activity?: number | null;
  health_score: number;
};

export type ClientHealthDetail = ClientHealthRow & {
  follow_up_ids: number[];
  work_item_ids: number[];
};

export function useCrmClientsHealth(params: () => { page: number; pageSize: number; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
    });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["crm-clients-health", p.page, p.pageSize, p.q ?? ""],
      queryFn: async () => {
        const res = await apiFetch<ClientHealthRow[]>(`/api/v1/crm/clients/health-summary?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load clients");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function useCrmClientHealth(partnerId: () => number | null) {
  return createQuery(() => {
    const id = partnerId();
    return {
      queryKey: ["crm-client-health", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<ClientHealthDetail>(`/api/v1/crm/clients/${id}/health`);
        if (!res.success) throw new Error(res.message ?? "Failed to load client");
        return res.data!;
      },
      staleTime: 30_000,
    };
  });
}
