import { apiFetch } from "../../shared/api";
import { getGlobalToast } from "../../shared/toast";
import type { LookupOption } from "../../shared/LookupCombo";

export type MfgBomType = "assembly" | "recipe" | "disassembly";

type BomRow = {
  id: number;
  bom_code: string;
  bom_name: string;
  finished_item_name?: string;
  bom_type?: string;
};

const TYPE_LABEL: Record<MfgBomType, string> = {
  assembly: "Assembly",
  recipe: "Recipe",
  disassembly: "Cutting",
};

function normalizeBomType(raw: string | undefined): MfgBomType {
  const v = (raw ?? "assembly").trim().toLowerCase();
  if (v === "recipe" || v === "process" || v === "processing") return "recipe";
  if (v === "disassembly" || v === "cutting") return "disassembly";
  return "assembly";
}

function toOption(b: BomRow): LookupOption {
  return {
    id: b.id,
    label: [b.bom_code, b.bom_name, b.finished_item_name].filter(Boolean).join(" — "),
  };
}

function toastRateLimited(message?: string) {
  getGlobalToast()?.warning(message?.trim() || "Too many requests. Please try again later.");
}

function toastWrongType(hit: BomRow, expected: MfgBomType) {
  const actual = normalizeBomType(hit.bom_type);
  const code = hit.bom_code || "This BOM";
  const pathHint =
    actual === "recipe"
      ? "Use New Recipe Order."
      : actual === "disassembly"
        ? "Use New Cutting Order."
        : "Use New Assembly Order.";
  getGlobalToast()?.warning(
    `${code} is a ${TYPE_LABEL[actual]} BOM — not ${TYPE_LABEL[expected]}. ${pathHint}`,
  );
}

/**
 * Search active BOMs for a production order wizard.
 * Surfaces rate-limit errors and wrong-type matches (e.g. Recipe R… on Assembly order).
 */
export async function searchBomsForOrderType(
  expectedType: MfgBomType,
  q: string,
): Promise<LookupOption[]> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "20",
    status: "active",
    bom_type: expectedType,
  });
  if (q.trim()) qs.set("q", q.trim());

  const res = await apiFetch<BomRow[]>(`/api/v1/manufacturing/boms?${qs}`, undefined, { silent: true });
  if (!res.ok || !res.success) {
    if (res.code === "ERR_RATE_LIMITED" || res.status === 429) {
      toastRateLimited(res.message);
    }
    return [];
  }

  const rows = res.data ?? [];
  if (rows.length > 0) return rows.map(toOption);

  const needle = q.trim();
  if (!needle) return [];

  // Empty for this order type — check whether the query matches a BOM of another type.
  const anyQs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", q: needle });
  const anyRes = await apiFetch<BomRow[]>(`/api/v1/manufacturing/boms?${anyQs}`, undefined, {
    silent: true,
  });
  if (!anyRes.ok || !anyRes.success) {
    if (anyRes.code === "ERR_RATE_LIMITED" || anyRes.status === 429) {
      toastRateLimited(anyRes.message);
    }
    return [];
  }

  const hits = anyRes.data ?? [];
  const wrong = hits.find((b) => normalizeBomType(b.bom_type) !== expectedType);
  if (wrong) toastWrongType(wrong, expectedType);
  return [];
}
