import { QueryClient } from "@tanstack/solid-query";
import { shouldRetryQuery } from "./queryRetry";

/** Shared QueryClient instance (used by App and mutation invalidation bridge). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Master data and lists stay fresh without constant polling. */
      staleTime: 30_000,
      gcTime: 300_000,
      /** Avoid focus storms that burn the per-user RPM budget (shell polls stay on interval). */
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      /** Only remount-fetch when staleTime has elapsed. */
      refetchOnMount: true,
      retry: shouldRetryQuery,
      placeholderData: (prev: unknown) => prev,
    },
  },
});
