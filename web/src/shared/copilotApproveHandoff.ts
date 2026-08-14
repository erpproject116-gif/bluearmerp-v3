import { approveCopilotAction, type CopilotActionDraft } from "../modules/help-assistant/helpApi";
import { safeAppPath } from "../modules/help-assistant/safeAppPath";

/** Approve-to-seed handoffs: draft type → sessionStorage key the target screen consumes once. */
export const COPILOT_SEED_STORAGE_KEYS: Record<string, string> = {
  create_quotation_from_rfq: "bluearm.rfqQuotationSeed",
  map_import_dataset: "bluearm.migImportSeed",
  open_quotation: "bluearm.docSeed.quotation",
  open_sales_order: "bluearm.docSeed.sales_order",
  open_sales: "bluearm.docSeed.sales",
  open_purchase_request: "bluearm.docSeed.purchase_request",
  open_rfq: "bluearm.docSeed.rfq",
  open_purchase_order: "bluearm.docSeed.purchase_order",
  open_purchases: "bluearm.docSeed.purchases",
  propose_serial_lot_import: "bluearm.serialLotSeed",
};

/** Draft types that are navigate-only (not in copilot executeApprovedDraft). */
export const NAVIGATE_ONLY_DRAFT_TYPES = new Set(["open_support_tickets", "open_crm", "open_baiko"]);

export type CopilotApproveResult = {
  next?: string;
  hint?: string;
  seed?: unknown;
};

/** Soft-cap oversized seeds so we stay under typical sessionStorage quotas. */
export function capSeedForStorage(seed: unknown): unknown {
  try {
    const raw = JSON.stringify(seed);
    if (raw.length <= 4_500_000) return seed;
    const s = seed as { lines?: Array<{ description?: string }> };
    if (Array.isArray(s?.lines)) {
      for (const line of s.lines) {
        if (line.description && line.description.length > 2_000) {
          line.description = line.description.slice(0, 2_000) + "\n…[truncated]";
        }
      }
    }
    return s;
  } catch {
    return seed;
  }
}

export function stageApprovedCopilotResult(
  draftType: string,
  result: CopilotApproveResult | undefined,
): { ok: boolean; error?: string } {
  const seedKey = COPILOT_SEED_STORAGE_KEYS[draftType];
  if (!result?.seed || !seedKey) return { ok: true };
  try {
    sessionStorage.setItem(seedKey, JSON.stringify(capSeedForStorage(result.seed)));
    return { ok: true };
  } catch {
    return { ok: false, error: "Approved, but the draft could not be staged in this browser." };
  }
}

export type ApproveAndOpenOutcome =
  | { ok: true; next: string; hint?: string; assigned: boolean }
  | { ok: true; next: null; hint?: string; assigned: false }
  | { ok: false; message: string };

/**
 * Approves a commercial open_* (or related) draft, stages seed when present, optionally assigns location.
 * Ticket/CRM types should use navigateOnlySafeAppPath instead.
 */
export async function approveAndOpenCopilotDraft(
  draft: CopilotActionDraft,
  sessionId?: number,
  opts?: { assignDelayMs?: number; skipAssign?: boolean },
): Promise<ApproveAndOpenOutcome> {
  const res = await approveCopilotAction(draft, sessionId);
  if (!res.success) {
    return { ok: false, message: res.message || "Approve failed." };
  }
  const result = res.data?.result as CopilotApproveResult | undefined;
  const staged = stageApprovedCopilotResult(draft.type, result);
  if (!staged.ok) {
    return { ok: false, message: staged.error || "Failed to stage seed." };
  }
  const next = result?.next ? safeAppPath(result.next) : null;
  if (next && !opts?.skipAssign) {
    const delay = opts?.assignDelayMs ?? 400;
    window.setTimeout(() => {
      window.location.assign(next);
    }, delay);
    return { ok: true, next, hint: result?.hint, assigned: true };
  }
  if (next) {
    return { ok: true, next, hint: result?.hint, assigned: false };
  }
  return { ok: true, next: null, hint: result?.hint, assigned: false };
}

/** Safe in-app navigate for ticket/CRM chips (no approve API). */
export function navigateOnlySafeAppPath(href: string, assignDelayMs = 0): string | null {
  const next = safeAppPath(href);
  if (!next) return null;
  if (assignDelayMs > 0) {
    window.setTimeout(() => {
      window.location.assign(next);
    }, assignDelayMs);
  } else {
    window.location.assign(next);
  }
  return next;
}

export function isNavigateOnlyDraftType(type: string | undefined | null): boolean {
  if (!type) return false;
  return NAVIGATE_ONLY_DRAFT_TYPES.has(type);
}

export function seedStorageKeyForDraftType(type: string): string | undefined {
  return COPILOT_SEED_STORAGE_KEYS[type];
}
