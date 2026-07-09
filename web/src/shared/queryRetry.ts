/** TanStack Query retry policy — never retry rate-limited responses (avoids retry storms). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const msg = error instanceof Error ? error.message : String(error);
  if (/429|rate limit|too many requests/i.test(msg)) return false;
  return true;
}

export function queryErrorFromApi(status: number, message?: string): Error {
  return new Error(`${status}: ${message ?? "Request failed"}`);
}
