/** Phase 1 manufacturing gates — mirror api posting_rules.go (PDF §12, §47, §53). */

export type WoStatus = "draft" | "released" | "completed" | "cancelled" | string;
export type StockChip = "in_stock" | "low_stock" | "insufficient";

export const componentStockStatus = (required: number, onHand: number, shortage = 0): StockChip => {
  if (shortage > 0.0001 || required > onHand + 0.0001) return "insufficient";
  if (required > 0 && onHand < required * 1.2) return "low_stock";
  return "in_stock";
};

export const stockChipLabel = (s: StockChip): string => {
  if (s === "insufficient") return "Insufficient";
  if (s === "low_stock") return "Low stock";
  return "In stock";
};

export const canEditWorkOrder = (status: WoStatus) => status === "draft";

export const canCancelWorkOrder = (status: WoStatus, hasPostedMoves: boolean) => {
  if (hasPostedMoves) return false;
  return status === "draft" || status === "released";
};

export const canReleaseWorkOrder = (status: WoStatus) => status === "draft";

export const canRevertToDraft = (status: WoStatus, hasPostedMoves: boolean, hasStaging: boolean) =>
  status === "released" && !hasPostedMoves && !hasStaging;

export const canCompleteWorkOrder = (
  status: WoStatus,
  inspectionStatus: string,
): { ok: boolean; reason?: string } => {
  if (status !== "released") return { ok: false, reason: "Only started jobs can be finished." };
  if (inspectionStatus === "pending" || inspectionStatus === "held") {
    return { ok: false, reason: "Quality check must pass before Finish." };
  }
  return { ok: true };
};

/** Negative inventory default OFF. */
export const canPostWithShortage = (hasShortage: boolean, allowNegative = false) =>
  !hasShortage || allowNegative;

export const materialNeedsHasShortage = (lines: { shortage?: number }[]) =>
  lines.some((l) => (l.shortage ?? 0) > 0.0001);

export const requiredComponentQty = (bomQtyPerUnit: number, actualCompleted: number) => {
  if (bomQtyPerUnit < 0 || actualCompleted < 0) return 0;
  return bomQtyPerUnit * actualCompleted;
};

/** Operator-facing status label (floor words). */
export const floorStatusLabel = (status: WoStatus): string => {
  switch (status) {
    case "draft":
      return "Draft";
    case "released":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return String(status);
  }
};

export type OutputClassification = "finished" | "byproduct" | "rework" | "waste";

export const normalizeOutputClassification = (v?: string | null): OutputClassification => {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "byproduct" || s === "by-product" || s === "by_product") return "byproduct";
  if (s === "rework") return "rework";
  if (s === "waste" || s === "scrap") return "waste";
  return "finished";
};

export const receivesStockForClassification = (v?: string | null) =>
  normalizeOutputClassification(v) !== "waste";

export const excessWasteQty = (expected: number, actual: number) =>
  actual > expected + 0.0001 ? actual - expected : 0;

/** Excess over expected, or an abnormal reason selected — requires waste_reason_id. */
export const wasteRequiresReason = (qty: number, expected: number, isAbnormalReason = false) => {
  if (!(qty > 0.0001)) return false;
  if (excessWasteQty(expected, qty) > 0) return true;
  return isAbnormalReason;
};

export const validateWasteLine = (
  qty: number,
  expected: number,
  reasonId: number | null | undefined,
  isAbnormalReason = false,
): string | null => {
  if (qty < 0) return "Waste quantity cannot be negative.";
  if (!(qty > 0.0001)) return null;
  if (wasteRequiresReason(qty, expected, isAbnormalReason) && !(reasonId && reasonId > 0)) {
    return "Abnormal or excess waste requires a waste reason.";
  }
  return null;
};
