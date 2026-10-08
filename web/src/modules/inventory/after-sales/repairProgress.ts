export const REPAIR_PROGRESS_STEPS = [
  "received",
  "diagnosing",
  "repairing",
  "awaiting_parts",
  "finished",
  "released",
] as const;

export type RepairProgress = (typeof REPAIR_PROGRESS_STEPS)[number];

const LABELS: Record<RepairProgress, string> = {
  received: "Received (RMA in)",
  diagnosing: "Diagnosing",
  repairing: "Repairing",
  awaiting_parts: "Awaiting parts",
  finished: "Finished (repaired)",
  released: "Released to active stock",
};

const WORKSHOP = new Set<string>(["received", "diagnosing", "repairing", "awaiting_parts"]);

export function repairProgressLabel(code: string): string {
  if (code in LABELS) return LABELS[code as RepairProgress];
  return code;
}

export function repairProgressAllowed(from: string, to: string): boolean {
  if (from === to) return (REPAIR_PROGRESS_STEPS as readonly string[]).includes(from);
  if (WORKSHOP.has(from)) return WORKSHOP.has(to) || to === "finished";
  if (from === "finished") return to === "repairing" || to === "awaiting_parts" || to === "released";
  return false;
}

/** Current step plus the steps the server will accept from it. A new order is Received only. */
export function repairProgressOptions(from: string): RepairProgress[] {
  if (!(REPAIR_PROGRESS_STEPS as readonly string[]).includes(from)) return ["received"];
  return REPAIR_PROGRESS_STEPS.filter((step) => step === from || repairProgressAllowed(from, step));
}

export const COVERAGE_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "covered", label: "Covered" },
  { value: "goodwill", label: "Goodwill" },
  { value: "denied", label: "Denied" },
] as const;

export const RECOVERY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "requested", label: "Requested" },
  { value: "recovered", label: "Recovered" },
] as const;

export function coverageDecisionLabel(code: string): string {
  return COVERAGE_OPTIONS.find((option) => option.value === code)?.label ?? (code || "Pending");
}

export function supplierRecoveryLabel(code: string): string {
  return RECOVERY_OPTIONS.find((option) => option.value === code)?.label ?? (code || "None");
}
