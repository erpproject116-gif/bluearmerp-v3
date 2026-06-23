import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type CrmNotification = {
  id: number;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entity_type?: string | null;
  entity_id?: number | null;
  read_at?: string | null;
  created_at: string;
};

export type CrmNotificationListParams = {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
  enabled?: boolean;
};

export function useCrmNotifications(params: () => CrmNotificationListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
    });
    if (p.unreadOnly) qs.set("unread_only", "true");
    return {
      queryKey: ["crm-notifications", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<CrmNotification[]>(`/api/v1/crm/notifications?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load notifications");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          unreadTotal: Number((res.meta as { unread_total?: number } | undefined)?.unread_total ?? 0),
        };
      },
      staleTime: 15_000,
      refetchInterval: p.enabled !== false ? 60_000 : false,
    };
  });
}

export function useCrmUnreadCount(enabled = true) {
  return useCrmNotifications(() => ({
    page: 1,
    pageSize: 1,
    unreadOnly: true,
    enabled,
  }));
}

export async function markCrmNotificationRead(id: number) {
  return apiFetch(`/api/v1/crm/notifications/${id}/read`, { method: "PATCH" }, {
    successMessage: "Notification marked read.",
  });
}

export async function markAllCrmNotificationsRead() {
  return apiFetch("/api/v1/crm/notifications/read-all", { method: "POST" }, {
    successMessage: "All notifications marked read.",
  });
}

export function useInvalidateCrmNotifications() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["crm-notifications"] });
    void client.invalidateQueries({ queryKey: ["crm-dashboard"] });
  };
}
