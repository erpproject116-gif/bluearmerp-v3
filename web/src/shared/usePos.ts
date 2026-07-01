import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PosSession = {
  id: number;
  session_no: string;
  location_id: number;
  location_name?: string;
  cashier_user_id: number;
  cashier_name?: string;
  status: string;
  opening_cash: number;
  closing_cash?: number | null;
  sales_total: number;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
  cart_lines?: PosCartLine[];
};

export type PosCartLine = {
  id: number;
  line_no: number;
  item_id: number;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type CheckoutResult = {
  sales_id: number;
  sales_no: string;
  grand_total: number;
};

export function usePosCurrentSession() {
  return createQuery(() => ({
    queryKey: ["pos-current-session"],
    queryFn: async () => {
      const res = await apiFetch<PosSession | null>("/api/v1/pos/sessions/current");
      if (!res.success) throw new Error(res.message ?? "Failed to load session");
      return res.data ?? null;
    },
    staleTime: 5_000,
  }));
}

export function useInvalidatePosSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["pos-current-session"] });
}

export async function openPosSession(body: { location_id: number; opening_cash: number }) {
  return apiFetch<PosSession>("/api/v1/pos/sessions", { method: "POST", body: JSON.stringify(body) });
}

export async function closePosSession(id: number, body: { closing_cash: number }) {
  return apiFetch<PosSession>(`/api/v1/pos/sessions/${id}/close`, { method: "POST", body: JSON.stringify(body) });
}

export async function addPosCartLine(sessionId: number, body: { item_id: number; qty: number; unit_price: number }) {
  return apiFetch<PosCartLine>(`/api/v1/pos/sessions/${sessionId}/cart-lines`, { method: "POST", body: JSON.stringify(body) });
}

export async function deletePosCartLine(sessionId: number, lineId: number) {
  return apiFetch(`/api/v1/pos/sessions/${sessionId}/cart-lines/${lineId}`, { method: "DELETE" });
}

export async function checkoutPos(sessionId: number, body: { tenders: { tender_type: string; amount: number }[] }) {
  return apiFetch<CheckoutResult>(`/api/v1/pos/sessions/${sessionId}/checkout`, { method: "POST", body: JSON.stringify(body) });
}
