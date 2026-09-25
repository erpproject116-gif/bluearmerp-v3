import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type TenantUserRow = {
  id: number;
  email: string;
  full_name: string;
  tenant_role: string;
  status: string;
  auth_linked: boolean;
  is_owner: boolean;
  invite_id?: number;
  invited_at?: string;
  invited_by_user_id?: number;
};

export type TenantRoleRow = {
  id: number;
  role_code: string;
  role_name: string;
  description?: string;
  is_system: boolean;
  can_manage_users: boolean;
  can_manage_form_settings: boolean;
  apply_user_scopes: boolean;
  is_active: boolean;
  sort_order: number;
  user_count?: number;
};

export type UserListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
};

export function useTenantUserList(params: () => UserListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);

    return {
      queryKey: ["user-management", "users", p],
      queryFn: async () => {
        const res = await apiFetch<TenantUserRow[]>(`/api/v1/user-management/users?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load users");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
    };
  });
}

export function useTenantRoleList() {
  return createQuery(() => ({
    queryKey: ["user-management", "roles"],
    queryFn: async () => {
      const res = await apiFetch<TenantRoleRow[]>("/api/v1/user-management/roles");
      if (!res.success) throw new Error(res.message ?? "Failed to load roles");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useInvalidateUserManagement() {
  const client = useQueryClient();
  return {
    users: () => void client.invalidateQueries({ queryKey: ["user-management", "users"] }),
    roles: () => void client.invalidateQueries({ queryKey: ["user-management", "roles"] }),
    all: () => void client.invalidateQueries({ queryKey: ["user-management"] }),
  };
}
