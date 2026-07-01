import { apiFetch } from "../../shared/api";
import type { LookupOption } from "../../shared/LookupCombo";

export async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ pageSize: "20", q, status: "active", partner_kind: "customer" });
  const res = await apiFetch<{ id: number; company_name: string }[]>(`/api/v1/inventory/partners?${qs}`);
  if (!res.success || !res.data) return [];
  return res.data.map((p) => ({ id: p.id, label: p.company_name }));
}

export async function fetchWarrantyAssets(q: string, partnerId: number | null): Promise<LookupOption[]> {
  if (!partnerId) return [];
  const qs = new URLSearchParams({ pageSize: "20", q, partner_id: String(partnerId) });
  const res = await apiFetch<{ id: number; serial_no: string; item_name: string }[]>(
    `/api/v1/crm/warranty-assets?${qs}`,
  );
  if (!res.success || !res.data) return [];
  return res.data.map((w) => ({
    id: w.id,
    label: `${w.serial_no} — ${w.item_name}`,
  }));
}

export async function fetchSupportUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(
    `/api/v1/inventory/after-sales/users${qs}`,
  );
  if (!res.success || !res.data) return [];
  return res.data.map((u) => ({ id: u.id, label: u.full_name, sublabel: u.email }));
}

export async function fetchRepairOrders(q: string, partnerId: number | null): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  if (partnerId) qs.set("partner_id", String(partnerId));
  const res = await apiFetch<{ id: number; repair_order_no: string; customer_name?: string }[]>(
    `/api/v1/inventory/repair-orders?${qs}`,
  );
  if (!res.success || !res.data) return [];
  return res.data.map((ro) => ({
    id: ro.id,
    label: ro.customer_name ? `${ro.repair_order_no} — ${ro.customer_name}` : ro.repair_order_no,
  }));
}
