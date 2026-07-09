import { apiFetch } from "./api";
import type { ItemSearchRow } from "./ItemSearchModal";

export type InventoryItemSearchBody = Record<string, unknown>;

export async function postInventoryItemSearch(body: InventoryItemSearchBody) {
  return apiFetch<ItemSearchRow[]>("/api/v1/inventory/items/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function inventoryItemSearchErrorMessage(res: { message?: string; errors?: Record<string, string> }) {
  const parts = Object.values(res.errors ?? {}).filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return res.message ?? "Item search failed.";
}
