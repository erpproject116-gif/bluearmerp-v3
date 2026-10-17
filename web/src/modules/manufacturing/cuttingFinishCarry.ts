export type CuttingFinishWeigh = {
  component_item_id: number;
  lot_no: string;
  qty: number;
};

export type CuttingFinishWaste = {
  component_item_id?: number;
  classification: string;
  qty: number;
  expected_qty: number;
  waste_reason_id?: number;
  notes?: string;
};

export type CuttingFinishCarry = {
  work_order_id: number;
  output_weighs: CuttingFinishWeigh[];
  waste_lines: CuttingFinishWaste[];
};

export function cuttingFinishStorageKey(workOrderId: number): string {
  return `bluearm.cuttingFinish:${workOrderId}`;
}

function isWeigh(value: unknown): value is CuttingFinishWeigh {
  if (!value || typeof value !== "object") return false;
  const row = value as CuttingFinishWeigh;
  return (
    typeof row.component_item_id === "number" &&
    typeof row.lot_no === "string" &&
    typeof row.qty === "number" &&
    Number.isFinite(row.qty)
  );
}

function isWaste(value: unknown): value is CuttingFinishWaste {
  if (!value || typeof value !== "object") return false;
  const row = value as CuttingFinishWaste;
  return typeof row.classification === "string" && typeof row.qty === "number" && typeof row.expected_qty === "number";
}

/** Returns the payload only when the stored work-order id matches. */
export function readCuttingFinishCarry(raw: string | null, workOrderId: number): CuttingFinishCarry | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as CuttingFinishCarry;
  if (row.work_order_id !== workOrderId) return null;
  if (!Array.isArray(row.output_weighs) || !row.output_weighs.every(isWeigh)) return null;
  if (!Array.isArray(row.waste_lines) || !row.waste_lines.every(isWaste)) return null;
  return {
    work_order_id: workOrderId,
    output_weighs: row.output_weighs,
    waste_lines: row.waste_lines,
  };
}

/** Waste lines always travel. Typed cut weights travel only when no parts are already recorded. */
export function cuttingFinishCompleteFields(
  carry: CuttingFinishCarry | null,
  stagedCutTotal: number,
): { waste_lines?: CuttingFinishWaste[]; output_weighs?: CuttingFinishWeigh[] } {
  if (!carry) return {};
  const fields: { waste_lines?: CuttingFinishWaste[]; output_weighs?: CuttingFinishWeigh[] } = {
    waste_lines: carry.waste_lines,
  };
  if (stagedCutTotal === 0) fields.output_weighs = carry.output_weighs;
  return fields;
}
