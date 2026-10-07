export type StockAdjustmentTrackingKind = "standard" | "serial" | "lot" | "both";

export function stockAdjustmentTrackingKind(line: {
  track_serial: boolean;
  track_lot: boolean;
}): StockAdjustmentTrackingKind {
  if (line.track_serial && line.track_lot) return "both";
  if (line.track_serial) return "serial";
  if (line.track_lot) return "lot";
  return "standard";
}

export function trackedAdjustmentMessage(kind: StockAdjustmentTrackingKind): string {
  if (kind === "both") {
    return "Quantity is controlled by serial units and lot batches. Fix the serial units and change the affected lot batch.";
  }
  if (kind === "serial") {
    return "Quantity is controlled by serial units. Open Serials and use Fix this unit.";
  }
  if (kind === "lot") {
    return "Quantity is controlled by lot batches. Open Lots and use Change quantity.";
  }
  return "";
}

/** Reason is highlighted inline; omit it from sticky toasts so it cannot become stale after typing. */
export function stockAdjustmentToastErrors(
  errors: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const blockers = { ...errors };
  delete blockers.reason;
  return blockers;
}
