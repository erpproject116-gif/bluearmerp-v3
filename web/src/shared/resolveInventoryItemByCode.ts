import {
  inventoryItemSearchErrorMessage,
  postInventoryItemSearch,
} from "./inventoryItemSearch";
import type { ItemSearchRow } from "./ItemSearchModal";

function normalizeCode(code: string): string {
  return code.trim();
}

function codesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function stripLeadingZeros(code: string): string {
  const t = code.trim();
  if (!t) return t;
  const stripped = t.replace(/^0+(?=\d)/, "");
  return stripped || t;
}

/**
 * Resolve a typed item code to a single inventory row (exact code match preferred).
 * Returns null when empty, not found, or ambiguous — callers keep free-text behavior.
 */
export async function resolveInventoryItemByCode(
  rawCode: string,
): Promise<{ item: ItemSearchRow | null; error?: string }> {
  const code = normalizeCode(rawCode);
  if (!code) return { item: null };

  const searchOnce = async (q: string) => {
    const res = await postInventoryItemSearch({
      item_code: q,
      usage_status: "active",
      page: 1,
      page_size: 50,
    });
    if (!res.success) {
      return { error: inventoryItemSearchErrorMessage(res), rows: [] as ItemSearchRow[] };
    }
    return { rows: res.data ?? [] };
  };

  const first = await searchOnce(code);
  if (first.error) return { item: null, error: first.error };

  let exact = first.rows.filter((r) => codesEqual(r.item_code, code));
  if (exact.length === 0) {
    const alt = stripLeadingZeros(code);
    if (alt !== code) {
      const second = await searchOnce(alt);
      if (second.error) return { item: null, error: second.error };
      exact = second.rows.filter(
        (r) => codesEqual(r.item_code, code) || codesEqual(r.item_code, alt) || codesEqual(stripLeadingZeros(r.item_code), alt),
      );
    }
  }

  if (exact.length === 1) return { item: exact[0]! };
  if (exact.length > 1) return { item: null }; // ambiguous — user should dbl-click search
  return { item: null };
}
