/** Fetch every page from a paginated list API until all rows are loaded. */
export async function fetchAllPaginatedPages<T>(options: {
  pageSize?: number;
  fetchPage: (page: number, pageSize: number) => Promise<{ rows: T[]; total: number }>;
}): Promise<T[]> {
  const pageSize = options.pageSize ?? 200;
  const rows: T[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    const batch = await options.fetchPage(page, pageSize);
    total = batch.total;
    if (!batch.rows.length) break;
    rows.push(...batch.rows);
    if (batch.rows.length < pageSize) break;
    page++;
  }

  return rows;
}
