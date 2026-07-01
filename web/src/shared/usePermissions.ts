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

export type GroupPermissionsPayload = {
  group_code: string;
  group_name: string;
  permissions: Record<string, string>;
};

export type RolePermissionsPayload = {
  role_code: string;
  role_name: string;
  permissions: Record<string, string>;
  can_submit?: Record<string, boolean>;
  can_cancel?: Record<string, boolean>;
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

export async function saveRolePermissions(
  roleId: number,
  permissions: Record<string, string>,
  canSubmit?: Record<string, boolean>,
  canCancel?: Record<string, boolean>,
) {
  return apiFetch<RolePermissionsPayload>(`/api/v1/user-management/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions, can_submit: canSubmit ?? {}, can_cancel: canCancel ?? {} }),
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
    groups: () => void client.invalidateQueries({ queryKey: ["user-groups"] }),
    group: (id: number) => void client.invalidateQueries({ queryKey: ["group-permissions", id] }),
  };
}

export type UserGroupRow = {
  id: number;
  group_code: string;
  group_name: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  member_count?: number;
};

export function useUserGroupList() {
  return createQuery(() => ({
    queryKey: ["user-groups"],
    queryFn: async () => {
      const res = await apiFetch<UserGroupRow[]>("/api/v1/user-management/groups");
      if (!res.success) throw new Error(res.message ?? "Failed to load groups");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useGroupPermissions(groupId: () => number | null) {
  return createQuery(() => {
    const id = groupId();
    return {
      queryKey: ["group-permissions", id],
      enabled: id != null,
      queryFn: async () => {
        const res = await apiFetch<GroupPermissionsPayload>(`/api/v1/user-management/groups/${id}/permissions`);
        if (!res.success) throw new Error(res.message ?? "Failed to load group permissions");
        return res.data!;
      },
    };
  });
}

export async function saveGroupPermissions(groupId: number, permissions: Record<string, string>) {
  return apiFetch<GroupPermissionsPayload>(`/api/v1/user-management/groups/${groupId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
}

export async function saveGroupMembers(groupId: number, userIds: number[]) {
  return apiFetch(`/api/v1/user-management/groups/${groupId}/members`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function saveUserGroups(userId: number, groupIds: number[]) {
  return apiFetch(`/api/v1/user-management/users/${userId}/groups`, {
    method: "PUT",
    body: JSON.stringify({ group_ids: groupIds }),
  });
}

export async function fetchUserGroups(userId: number) {
  return apiFetch<{ group_ids: number[] }>(`/api/v1/user-management/users/${userId}/groups`);
}

export type UserDataScope = { scope_type: string; record_id: number };

export async function fetchUserDataScopes(userId: number) {
  return apiFetch<UserDataScope[]>(`/api/v1/user-management/users/${userId}/data-scopes`);
}

export async function saveUserDataScopes(userId: number, scopes: UserDataScope[]) {
  return apiFetch<UserDataScope[]>(`/api/v1/user-management/users/${userId}/data-scopes`, {
    method: "PUT",
    body: JSON.stringify({ scopes }),
  });
}
