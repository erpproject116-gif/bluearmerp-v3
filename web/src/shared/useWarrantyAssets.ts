import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type WarrantyAssetStatus = "active" | "expired" | "void";

export type WarrantyAsset = {
  id: number;
  partner_id: number;
  partner_name?: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  serial_no: string;
  sales_id?: number | null;
  warranty_start: string;
  warranty_end: string;
  status: WarrantyAssetStatus;
  pic_user_id?: number | null;
  pic_name: string;
};

export type WarrantyAssetListParams = {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  partnerId?: number | null;
  expiryFrom?: string;
  expiryTo?: string;
};

export function useWarrantyAssets(params: () => WarrantyAssetListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
    });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    if (p.partnerId) qs.set("partner_id", String(p.partnerId));
    if (p.expiryFrom) qs.set("expiry_from", p.expiryFrom);
    if (p.expiryTo) qs.set("expiry_to", p.expiryTo);
    return {
      queryKey: ["crm-warranty-assets", p],
      queryFn: async () => {
        const res = await apiFetch<WarrantyAsset[]>(`/api/v1/crm/warranty-assets?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load warranty assets");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 30_000,
    };
  });
}

export async function patchWarrantyAsset(
  id: number,
  payload: Partial<{ warranty_end: string; status: WarrantyAssetStatus }>,
) {
  return apiFetch(`/api/v1/crm/warranty-assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function syncWarrantyFromSales(salesId: number) {
  return apiFetch(`/api/v1/crm/warranty-assets/sync-from-sales/${salesId}`, { method: "POST" });
}

export function useInvalidateWarrantyAssets() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-warranty-assets"] });
}
