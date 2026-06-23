import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PermissionRegistryRow = {
  permission_code: string;
  module_code: string;
  feature_key?: string | null;
  label: string;
  sort_order: number;
};

export type PermissionModuleGroup = {
  module_code: string;
  module_label: string;
  permissions: PermissionRegistryRow[];
};

export type RolePermissionsPayload = {
  role_code: string;
  role_name: string;
  permissions: Record<string, string>;
};

export type UserPermissionsPayload = {
  user_id: number;
  email: string;
  full_name: string;
  tenant_role: string;
  role_permissions: Record<string, string>;
  overrides: Record<string, string>;
  effective: Record<string, string>;
};

export function usePermissionRegistry() {
  return createQuery(() => ({
    queryKey: ["permission-registry"],
    queryFn: async () => {
      const res = await apiFetch<PermissionModuleGroup[]>("/api/v1/user-management/permissions/registry");
      if (!res.success) throw new Error(res.message ?? "Failed to load permissions");
      return res.data ?? [];
    },
    staleTime: 300_000,
  }));
}

export function useRolePermissions(roleId: () => number | null) {
  return createQuery(() => {
    const id = roleId();
    return {
      queryKey: ["role-permissions", id],
      enabled: id != null,
      queryFn: async () => {
        const res = await apiFetch<RolePermissionsPayload>(`/api/v1/user-management/roles/${id}/permissions`);
        if (!res.success) throw new Error(res.message ?? "Failed to load role permissions");
        return res.data!;
      },
    };
  });
}

export function useUserPermissions(userId: () => number | null) {
  return createQuery(() => {
    const id = userId();
    return {
      queryKey: ["user-permissions", id],
      enabled: id != null,
      queryFn: async () => {
        const res = await apiFetch<UserPermissionsPayload>(`/api/v1/user-management/users/${id}/permissions`);
        if (!res.success) throw new Error(res.message ?? "Failed to load user permissions");
        return res.data!;
      },
    };
  });
}

export async function saveRolePermissions(roleId: number, permissions: Record<string, string>) {
  return apiFetch<RolePermissionsPayload>(`/api/v1/user-management/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
}

export async function saveUserPermissionOverrides(userId: number, overrides: Record<string, string>) {
  return apiFetch<UserPermissionsPayload>(`/api/v1/user-management/users/${userId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ overrides }),
  });
}

export function useInvalidatePermissions() {
  const client = useQueryClient();
  return {
    registry: () => void client.invalidateQueries({ queryKey: ["permission-registry"] }),
    role: (id: number) => void client.invalidateQueries({ queryKey: ["role-permissions", id] }),
    user: (id: number) => void client.invalidateQueries({ queryKey: ["user-permissions", id] }),
  };
}
