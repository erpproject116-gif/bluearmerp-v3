import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { DEFAULT_HOME_WIDGETS, normalizeHomeWidgets, type HomeWidgetId } from "./homeWidgets";

type HomeLayoutPayload = { widget_ids: string[] };

export function useHomeLayout() {
  return createQuery(() => ({
    queryKey: ["dashboard-home-layout"],
    queryFn: async () => {
      const res = await apiFetch<HomeLayoutPayload>("/api/v1/dashboard/home-layout");
      if (!res.success) throw new Error(res.message ?? "Failed to load Home layout");
      return normalizeHomeWidgets(res.data?.widget_ids);
    },
    staleTime: 60_000,
    placeholderData: DEFAULT_HOME_WIDGETS,
  }));
}

export function useSaveHomeLayout() {
  const client = useQueryClient();
  return createMutation(() => ({
    mutationFn: async (widgetIds: HomeWidgetId[]) => {
      const ids = normalizeHomeWidgets(widgetIds);
      const res = await apiFetch<HomeLayoutPayload>("/api/v1/dashboard/home-layout", {
        method: "PUT",
        body: JSON.stringify({ widget_ids: ids }),
      });
      if (!res.success) throw new Error(res.message ?? "Failed to save Home layout");
      return normalizeHomeWidgets(res.data?.widget_ids);
    },
    onSuccess: (ids) => {
      client.setQueryData(["dashboard-home-layout"], ids);
    },
  }));
}
