/** True only during the first fetch (no cached data yet). Prefer over raw isFetching for grid loading props. */
export function listQueryLoading(q: { isFetching: boolean; data?: unknown }) {
  return q.isFetching && q.data == null;
}
