/**
 * Copilot approve-to-seed handoff for document create forms.
 *
 * On Approve of an `open_*` draft the chat stages a sanitized seed in
 * sessionStorage under `bluearm.docSeed.<kind>`; the target create form takes
 * it exactly once and prefills partner + lines. Nothing is saved or posted
 * until the user reviews and saves the form.
 */

export type DocSeedKind =
  | "quotation"
  | "sales_order"
  | "sales"
  | "purchase_request"
  | "rfq"
  | "purchase_order"
  | "purchases";

export type DocSeedLine = {
  item_id?: number | null;
  item_code?: string;
  item_name?: string;
  description?: string;
  qty?: number | string;
  unit?: string;
  unit_id?: number | null;
  unit_code?: string | null;
  unit_price?: number | string;
  remarks?: string;
};

export type DocSeed = {
  partner_id?: number | null;
  partner_name?: string;
  partner_code?: string;
  needs_qty_review?: boolean;
  lines?: DocSeedLine[];
};

export function docSeedKey(kind: DocSeedKind): string {
  return `bluearm.docSeed.${kind}`;
}

/** Non-destructive check, e.g. for list pages that auto-open their create modal. */
export function hasDocSeed(kind: DocSeedKind): boolean {
  try {
    return !!sessionStorage.getItem(docSeedKey(kind));
  } catch {
    return false;
  }
}

/** Take (and clear) the staged seed. Returns null when absent or malformed. */
export function takeDocSeed(kind: DocSeedKind): DocSeed | null {
  const key = docSeedKey(kind);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as DocSeed;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.lines && !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Copilot "propose_serial_lot_import" Approve stages this seed; the Serial &
 * Lot receive page consumes it once into the paste-serials buffer. Nothing is
 * registered until the user imports via the existing capture controls.
 */
export type SerialLotSeed = {
  file_name?: string;
  rows?: Array<{ serial?: string; lot?: string; item_code?: string; qty?: number }>;
  serial_count?: number;
  lot_count?: number;
};

export const SERIAL_LOT_SEED_KEY = "bluearm.serialLotSeed";

export function takeSerialLotSeed(): SerialLotSeed | null {
  try {
    const raw = sessionStorage.getItem(SERIAL_LOT_SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SERIAL_LOT_SEED_KEY);
    const parsed = JSON.parse(raw) as SerialLotSeed;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Common field patch for a seed line; consumers spread this over their
 * module-specific empty-line row (which uses `remark`, not `remarks`).
 */
export function docSeedLinePatch(line: DocSeedLine): {
  item_id: number | null;
  item_code: string;
  item_name: string;
  description: string;
  qty: string;
  unit_id: number | null;
  unit_code: string;
  unit_price: string;
  remark: string;
} {
  const unitId = line.unit_id ?? null;
  const unitCode = (line.unit_code ?? line.unit ?? "").trim();
  const unresolvedUnit = !unitId && !unitCode && line.unit?.trim() ? `UOM: ${line.unit.trim()}` : "";
  const remarks = [line.remarks?.trim(), unresolvedUnit].filter(Boolean);
  const price = line.unit_price == null || line.unit_price === 0 ? "" : String(line.unit_price);
  return {
    item_id: line.item_id ?? null,
    item_code: line.item_code?.trim() ?? "",
    item_name: line.item_name?.trim() ?? "",
    description: line.description?.trim() ?? "",
    qty: line.qty == null ? "1" : String(line.qty),
    unit_id: unitId,
    unit_code: unitCode,
    unit_price: price,
    remark: remarks.join(" · "),
  };
}
