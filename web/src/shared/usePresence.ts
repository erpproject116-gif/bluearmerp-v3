import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { queryErrorFromApi, shouldRetryQuery } from "./queryRetry";

export type PresenceUser = {
  user_id: number;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  current_path: string;
  current_label: string;
  activity: string;
  last_seen_at: string;
  is_self: boolean;
};

export type PresenceHeartbeatPayload = {
  current_path: string;
  current_label: string;
  activity?: string;
  avatar_url?: string;
};

export async function sendPresenceHeartbeat(payload: PresenceHeartbeatPayload) {
  return apiFetch("/api/v1/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      activity: payload.activity ?? "viewing",
      current_path: payload.current_path,
      current_label: payload.current_label,
      avatar_url: payload.avatar_url ?? "",
    }),
  }, { silent: true });
}

export async function clearPresence() {
  return apiFetch("/api/v1/presence/", { method: "DELETE" }, { silent: true });
}

export function useOnlinePresence(enabled: () => boolean) {
  return createQuery(() => ({
    queryKey: ["presence-online"],
    enabled: enabled(),
    queryFn: async () => {
      const res = await apiFetch<PresenceUser[]>("/api/v1/presence/online?stale_seconds=120");
      if (!res.success) throw queryErrorFromApi(res.status, res.message ?? "Failed to load presence");
      return res.data ?? [];
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
    refetchOnWindowFocus: false,
    retry: shouldRetryQuery,
  }));
}
