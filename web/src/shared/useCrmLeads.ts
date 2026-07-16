import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "converted";

export type Lead = {
  id: number;
  lead_name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  source: string;
  status: LeadStatus;
  partner_id?: number | null;
  pic_user_id?: number | null;
  pic_name: string;
  notes?: string | null;
};

export type OpportunityStage =
  | "prospect"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type Opportunity = {
  id: number;
  lead_id?: number | null;
  lead_name?: string;
  partner_id?: number | null;
  partner_name?: string;
  title: string;
  stage: OpportunityStage;
  expected_value?: number | null;
  expected_close_date?: string | null;
  probability?: number | null;
  quotation_id?: number | null;
  pic_user_id?: number | null;
  pic_name: string;
  notes?: string | null;
};

export type LeadListParams = { page: number; pageSize: number; q?: string; status?: string };
export type OpportunityListParams = { page: number; pageSize: number; q?: string; stage?: string };

export function useLeads(params: () => LeadListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    return {
      queryKey: ["crm-leads", p],
      queryFn: async () => {
        const res = await apiFetch<Lead[]>(`/api/v1/crm/leads?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load leads");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useOpportunities(params: () => OpportunityListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    if (p.stage) qs.set("stage", p.stage);
    return {
      queryKey: ["crm-opportunities", p],
      queryFn: async () => {
        const res = await apiFetch<Opportunity[]>(`/api/v1/crm/opportunities?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load opportunities");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
      placeholderData: (prev) => prev,
    };
  });
}

export async function createLead(body: Partial<Lead>) {
  return apiFetch<Lead>("/api/v1/crm/leads", { method: "POST", body: JSON.stringify(body) });
}

export async function patchLead(id: number, body: Partial<Lead>) {
  return apiFetch<Lead>(`/api/v1/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function convertLeadToQuotation(id: number) {
  return apiFetch<{ redirect_to?: string; message?: string; quotation_id?: number }>(
    `/api/v1/crm/leads/${id}/convert-to-quotation`,
    { method: "POST" },
  );
}

export async function createOpportunity(body: Partial<Opportunity>) {
  return apiFetch<Opportunity>("/api/v1/crm/opportunities", { method: "POST", body: JSON.stringify(body) });
}

export async function patchOpportunity(id: number, body: Partial<Opportunity>) {
  return apiFetch<Opportunity>(`/api/v1/crm/opportunities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function useInvalidateLeads() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-leads"] });
}

export function useInvalidateOpportunities() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-opportunities"] });
}
