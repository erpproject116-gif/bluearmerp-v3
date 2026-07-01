import { apiFetch } from "./api";

/** Resolve selling rate from partner default price list, else item sales_price. */
export async function resolveItemRate(
  partnerId: number | null | undefined,
  itemId: number,
): Promise<number | null> {
  if (!partnerId) return null;
  const qs = new URLSearchParams({
    item_id: String(itemId),
    partner_id: String(partnerId),
  });
  const res = await apiFetch<{ rate: number }>(`/api/v1/inventory/price-lists/resolve-rate?${qs}`);
  if (!res.success || res.data == null) return null;
  return res.data.rate;
}
