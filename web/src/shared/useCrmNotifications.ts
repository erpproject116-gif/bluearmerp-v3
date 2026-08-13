import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { queryErrorFromApi, shouldRetryQuery } from "./queryRetry";

export type CrmNotificationSource = "activity" | "rule" | "support" | "system";

export type CrmNotification = {
  id: number;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entity_type?: string | null;
  entity_id?: number | null;
  source?: CrmNotificationSource;
  href?: string;
  read_at?: string | null;
  created_at: string;
};

export type CrmNotificationListParams = {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
  source?: CrmNotificationSource | "";
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
    if (p.source) qs.set("source", p.source);
    return {
      queryKey: ["crm-notifications", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<CrmNotification[]>(`/api/v1/crm/notifications?${qs}`);
        if (!res.success) throw queryErrorFromApi(res.status, res.message ?? "Failed to load notifications");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          unreadTotal: Number((res.meta as { unread_total?: number } | undefined)?.unread_total ?? 0),
        };
      },
      staleTime: 30_000,
      refetchInterval: p.enabled !== false ? 60_000 : false,
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
    };
  });
}

/** Page size of the shell feed shared by the bell dropdown and the toast poller. */
const SHELL_FEED_PAGE_SIZE = 10;

/**
 * The one notification query the app shell polls. Both the bell (badge +
 * dropdown) and the toast poller call this with identical params so TanStack
 * dedupes them into a single 60s request instead of two.
 */
export function useCrmNotificationFeed(enabled: () => boolean) {
  return useCrmNotifications(() => ({
    page: 1,
    pageSize: SHELL_FEED_PAGE_SIZE,
    enabled: enabled(),
  }));
}

export async function markCrmNotificationRead(id: number) {
  return apiFetch(`/api/v1/crm/notifications/${id}/read`, { method: "PATCH" }, {
    silent: true,
  });
}

export async function markAllCrmNotificationsRead() {
  return apiFetch("/api/v1/crm/notifications/read-all", { method: "POST" }, {
    silent: true,
  });
}

export function useInvalidateCrmNotifications() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["crm-notifications"] });
    void client.invalidateQueries({ queryKey: ["crm-dashboard"] });
  };
}
