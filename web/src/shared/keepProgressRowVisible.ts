/**
 * After a progress/confirm change, if the list is filtered to a different
 * progress value, switch to All so the updated row stays visible.
 */
export function keepProgressRowVisible(
  currentFilter: string,
  setStatusFilter: (value: string) => void,
  newProgress: string,
): void {
  const current = (currentFilter ?? "").trim();
  if (!current) return;
  const next = (newProgress ?? "").trim();
  if (current === next) return;
  // PO list may use "confirm" as a synonym for completed in filters.
  if (current === "confirm" && next === "completed") return;
  setStatusFilter("");
}
