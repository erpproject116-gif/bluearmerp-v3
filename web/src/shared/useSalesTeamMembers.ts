import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SalesTeamMember = {
  id: number;
  full_name: string;
  email: string;
  tenant_role: string;
};

export function useSalesTeamMembers(enabled: () => boolean = () => true) {
  return createQuery(() => ({
    queryKey: ["crm-sales-team"],
    enabled: enabled(),
    queryFn: async () => {
      const res = await apiFetch<SalesTeamMember[]>("/api/v1/crm/sales-team/members");
      if (!res.success) throw new Error(res.message ?? "Failed to load sales team");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}
