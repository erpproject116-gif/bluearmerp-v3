import { apiFetch } from "../../shared/api";
import { getGlobalToast } from "../../shared/toast";
import type { LookupOption } from "../../shared/LookupCombo";
import {
  newAssemblyOrderHref,
  newCuttingOrderHref,
  newRecipeOrderHref,
} from "../production/mfgProductionMode";

export type MfgBomType = "assembly" | "recipe" | "disassembly";

export type BomRow = {
  id: number;
  bom_code: string;
  bom_name: string;
  finished_item_code?: string;
  finished_item_name?: string;
  bom_type?: string;
};

export type BomMismatch = {
  code: string;
  actual: MfgBomType;
  expected: MfgBomType;
  href: string;
  cta: string;
};

export type BomSearchResult = {
  options: LookupOption[];
  mismatch?: BomMismatch;
  rateLimited?: boolean;
};

const TYPE_LABEL: Record<MfgBomType, string> = {
  assembly: "Assembly",
  recipe: "Recipe",
  disassembly: "Cutting",
};

export function normalizeBomType(raw: string | undefined): MfgBomType {
  const v = (raw ?? "assembly").trim().toLowerCase();
  if (v === "recipe" || v === "process" || v === "processing") return "recipe";
  if (v === "disassembly" || v === "cutting") return "disassembly";
  return "assembly";
}

export function orderHrefForBomType(t: MfgBomType): string {
  if (t === "recipe") return newRecipeOrderHref();
  if (t === "disassembly") return newCuttingOrderHref();
  return newAssemblyOrderHref();
}

export function ctaForBomType(t: MfgBomType): string {
  if (t === "recipe") return "Open New Recipe Order";
  if (t === "disassembly") return "Open New Cutting Order";
  return "Open New Assembly Order";
}

export function toBomOption(b: BomRow): LookupOption {
  return {
    id: b.id,
    label: [b.bom_code, b.bom_name, b.finished_item_code, b.finished_item_name].filter(Boolean).join(" — "),
  };
}

function toastRateLimited(message?: string) {
  const toast = getGlobalToast();
  const title = (message ?? "").trim() || "Too many requests. Please try again later.";
  if (toast?.action) {
    toast.action({
      type: "warning",
      title,
      message: "Wait a few seconds, then search again. Do not keep typing — each keystroke hits the server.",
      askHelp: true,
    });
    return;
  }
  toast?.warning(title);
}

function toastWrongType(mismatch: BomMismatch) {
  const toast = getGlobalToast();
  const title = `${mismatch.code} is a ${TYPE_LABEL[mismatch.actual]} BOM — not ${TYPE_LABEL[mismatch.expected]}.`;
  if (toast?.action) {
    toast.action({
      type: "warning",
      title,
      message: `This screen only lists ${TYPE_LABEL[mismatch.expected]} BOMs. Use the matching New Order screen.`,
      actionLabel: mismatch.cta,
      href: mismatch.href,
      askHelp: true,
    });
    return;
  }
  toast?.warning(`${title} ${mismatch.cta}.`);
}

function mismatchFromRow(hit: BomRow, expected: MfgBomType): BomMismatch {
  const actual = normalizeBomType(hit.bom_type);
  return {
    code: hit.bom_code || "This BOM",
    actual,
    expected,
    href: orderHrefForBomType(actual),
    cta: ctaForBomType(actual),
  };
}

async function fetchBoms(params: URLSearchParams) {
  return apiFetch<BomRow[]>(`/api/v1/manufacturing/boms?${params}`, undefined, { silent: true });
}

function isRateLimited(res: { code?: string; status?: number }): boolean {
  return res.code === "ERR_RATE_LIMITED" || res.status === 429;
}

/**
 * Search active BOMs for a production order wizard.
 * Surfaces rate-limit errors and wrong-type matches (e.g. Recipe R… on Assembly order).
 */
export async function lookupBomsForOrderType(
  expectedType: MfgBomType,
  q: string,
): Promise<BomSearchResult> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "20",
    status: "active",
    bom_type: expectedType,
  });
  if (q.trim()) qs.set("q", q.trim());

  const res = await fetchBoms(qs);
  if (!res.ok || !res.success) {
    if (isRateLimited(res)) {
      toastRateLimited(res.message);
      return { options: [], rateLimited: true };
    }
    return { options: [] };
  }

  const rows = res.data ?? [];
  if (rows.length > 0) return { options: rows.map(toBomOption) };

  const needle = q.trim();
  if (!needle) return { options: [] };

  // Empty for this order type — check whether the query matches a BOM of another type.
  // Brief pause so the extra call is less likely to 429 after the first search.
  await new Promise((r) => setTimeout(r, 350));
  const anyQs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", q: needle });
  const anyRes = await fetchBoms(anyQs);
  if (!anyRes.ok || !anyRes.success) {
    if (isRateLimited(anyRes)) {
      toastRateLimited(anyRes.message);
      return { options: [], rateLimited: true };
    }
    return { options: [] };
  }

  const hits = anyRes.data ?? [];
  const wrong = hits.find((b) => normalizeBomType(b.bom_type) !== expectedType);
  if (wrong) {
    const mismatch = mismatchFromRow(wrong, expectedType);
    toastWrongType(mismatch);
    return { options: [], mismatch };
  }
  return { options: [] };
}

export async function searchBomsForOrderType(
  expectedType: MfgBomType,
  q: string,
): Promise<LookupOption[]> {
  const result = await lookupBomsForOrderType(expectedType, q);
  return result.options;
}
