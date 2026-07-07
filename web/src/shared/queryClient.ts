import { QueryClient } from "@tanstack/solid-query";

/** Shared QueryClient instance (used by App and mutation invalidation bridge). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Treat data as stale quickly so invalidation/refetch shows fresh rows. */
      staleTime: 5_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      /** Background refresh while a list/report page is open (tab visible). */
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  },
});
