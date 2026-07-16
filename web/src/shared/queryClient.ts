import { QueryClient } from "@tanstack/solid-query";
import { shouldRetryQuery } from "./queryRetry";

/** Shared QueryClient instance (used by App and mutation invalidation bridge). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Master data and lists stay fresh without constant polling. */
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: shouldRetryQuery,
      placeholderData: (prev: unknown) => prev,
    },
  },
});
