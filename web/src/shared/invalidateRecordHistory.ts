import type { QueryClient } from "@tanstack/solid-query";

/** Drop cached per-record history after a save so the next open refetches. */
export function invalidateRecordHistory(
  queryClient: QueryClient,
  targetType: string,
  targetId: number | string,
) {
  void queryClient.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key) || key[0] !== "activity-logs") return false;
      const params = key[1] as { targetType?: string; targetId?: string } | undefined;
      return params?.targetType === targetType && params?.targetId === String(targetId);
    },
  });
}
