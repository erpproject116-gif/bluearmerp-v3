import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

/** Canonical POS tender/payment methods (codes must match the DB check constraint). */
export const POS_TENDER_TYPES = ["cash", "gcash", "maya", "qrph", "card", "bank_transfer", "other"] as const;

const POS_TENDER_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  qrph: "QRPh",
  card: "Card",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

/** Human-friendly label for a tender code (falls back to a title-cased code). */
export function posTenderLabel(code: string): string {
  const key = (code ?? "").trim().toLowerCase();
  if (POS_TENDER_LABELS[key]) return POS_TENDER_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Non-cash tenders don't affect the cash drawer and take the exact amount due. */
export function isCashTender(code: string): boolean {
  return (code ?? "").trim().toLowerCase() === "cash";
}

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

export type PosCartLineModifier = {
  id: number;
  modifier_id?: number;
  name: string;
  price_delta: number;
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
  notes?: string | null;
  size_label?: string | null;
  guest_no?: number;
  serial_unit_ids?: number[];
  lot_batch_id?: number | null;
  lot_no?: string;
  /** From inv_items — reliable even when catalog category filter omits the item. */
  track_lot?: boolean;
  track_serial?: boolean;
  modifiers?: PosCartLineModifier[];
};

export type PosModifier = {
  id: number;
  group_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
  active: boolean;
};

export type PosModifierGroup = {
  id: number;
  name: string;
  scope: string;
  item_id?: number | null;
  category_id?: number | null;
  min_select: number;
  max_select: number;
  required: boolean;
  sort_order: number;
  active: boolean;
  modifiers: PosModifier[];
};

export type CheckoutResult = {
  sales_id: number;
  sales_no: string;
  grand_total: number;
  change: number;
  journal_entry_id?: number;
  official_receipt_id?: number;
  receipt_format?: PosReceiptFormat;
};

export type PosReceiptLine = {
  item_name: string;
  item_code?: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type PosReceiptTender = {
  tender_type: string;
  amount: number;
};

/** Frozen checkout slip snapshot — render only; not an HTML builder. */
export type PosReceiptFormat = {
  doc_title: string;
  company_name: string;
  address?: string;
  phone?: string;
  email?: string;
  location_name?: string;
  cashier_name?: string;
  session_no?: string;
  sales_no: string;
  official_receipt_no?: string | null;
  official_receipt_id?: number | null;
  at: string;
  order_type?: string;
  table_label?: string;
  lines: PosReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  grand_total: number;
  change: number;
  tenders: PosReceiptTender[];
  footer_note: string;
  /** Settings → Branding receipt footer (snapshotted at checkout). */
  brand_footer?: string;
};

export type HeldOrder = {
  id: number;
  label: string;
  order_type: string;
  line_count: number;
  total: number;
  created_at: string;
};

export type SessionReport = {
  session_no: string;
  status: string;
  opening_cash: number;
  sales_total: number;
  tenders_by_type: Record<string, number>;
  cash_in: number;
  cash_out: number;
  coin_exchange?: number;
  expected_cash: number;
  closing_cash?: number | null;
  variance?: number | null;
};

export type CashMovement = {
  id: number;
  movement_type: string;
  amount: number;
  reason?: string;
  created_at: string;
  actor_name?: string;
};

export type PosLog = {
  id: number;
  action_code: string;
  target_type: string;
  target_id?: number;
  actor_name?: string;
  created_at: string;
};

export type PosCatalogCategory = {
  id: number;
  code: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order: number;
};

export type PosCatalogItem = {
  id: number;
  item_code: string;
  item_name: string;
  price: number;
  image_url?: string;
  item_category_id?: number | null;
  track_inventory_qty: boolean;
  track_serial?: boolean;
  track_lot?: boolean;
  has_modifiers: boolean;
  pos_visible?: boolean;
  qty_available?: number | null;
  reorder_level?: number | null;
  /** ok | low | sold_out | untracked */
  stock_status?: string;
  is_top_seller?: boolean;
};

export type PosSettings = {
  default_location_id?: number | null;
  default_location_name?: string;
  default_tax_type_id?: number | null;
  tax_inclusive: boolean;
  order_types: string[];
  allowed_tenders: string[];
  require_customer: boolean;
  enable_barcode: boolean;
  receipt_footer?: string;
  tax_mode?: string;
  tax_rate_percent?: number;
  auto_post_accounting?: boolean;
  auto_create_receipt?: boolean;
  sales_account_id?: number | null;
  receivable_account_id?: number | null;
  cash_account_id?: number | null;
  card_account_id?: number | null;
  student_discount_pct?: number;
  privilege_senior_pct?: number;
  privilege_pwd_pct?: number;
  tip_enabled?: boolean;
  /** Tenant overrides for POS button / form copy. */
  ui_labels?: Record<string, string>;
  /** POS color palette (primary, accent, header_bg, …). */
  theme?: Record<string, string>;
  /** retail | restaurant — drives label presets. */
  hospitality_profile?: string;
};

export function usePosCatalogCategories() {
  return createQuery(() => ({
    queryKey: ["pos-catalog-categories"],
    queryFn: async () => {
      const res = await apiFetch<PosCatalogCategory[]>("/api/v1/pos/catalog/categories");
      if (!res.success) throw new Error(res.message ?? "Failed to load categories");
      return res.data ?? [];
    },
    staleTime: 30_000,
  }));
}

export function usePosCatalogItems(params: () => {
  categoryId?: number | null;
  q?: string;
  locationId?: number | null;
  stock?: string | null;
}) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams();
    if (p.categoryId) qs.set("category_id", String(p.categoryId));
    if (p.q) qs.set("q", p.q);
    if (p.locationId) qs.set("location_id", String(p.locationId));
    if (p.stock && p.stock !== "all") qs.set("stock", p.stock);
    const suffix = qs.toString() ? `?${qs}` : "";
    return {
      queryKey: ["pos-catalog-items", p.categoryId ?? null, p.q ?? "", p.locationId ?? null, p.stock ?? "all"],
      queryFn: async () => {
        const res = await apiFetch<PosCatalogItem[]>(`/api/v1/pos/catalog/items${suffix}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load items");
        return res.data ?? [];
      },
      staleTime: 15_000,
    };
  });
}

export async function setPosItemVisible(itemId: number, posVisible: boolean) {
  return apiFetch<{ id: number; pos_visible: boolean }>(`/api/v1/pos/catalog/items/${itemId}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ pos_visible: posVisible }),
  });
}

export function usePosSettings() {
  return createQuery(() => ({
    queryKey: ["pos-settings"],
    queryFn: async () => {
      const res = await apiFetch<PosSettings>("/api/v1/pos/settings");
      if (!res.success) throw new Error(res.message ?? "Failed to load settings");
      return res.data ?? null;
    },
    staleTime: 60_000,
  }));
}

export async function savePosSettings(body: PosSettings) {
  return apiFetch<PosSettings>("/api/v1/pos/settings", { method: "PUT", body: JSON.stringify(body) });
}

export async function patchPosCartLine(
  sessionId: number,
  lineId: number,
  body: { qty?: number; unit_price?: number; guest_no?: number; serial_unit_ids?: number[]; lot_batch_id?: number | null },
) {
  return apiFetch<PosCartLine>(`/api/v1/pos/sessions/${sessionId}/cart-lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

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

export type PosLotPickCandidate = {
  id: number;
  lot_no: string;
  qty_on_hand: number;
  expiry_date?: string;
};

/** Returned in res.data when code is ERR_POS_LOT_PICK (HTTP 409). */
export type PosLotPickPayload = {
  needs_lot_pick: boolean;
  item_id: number;
  item_name: string;
  qty: number;
  unit_price: number;
  modifier_ids?: number[];
  notes?: string | null;
  size_label?: string | null;
  lots: PosLotPickCandidate[];
};

export async function addPosCartLine(
  sessionId: number,
  body: {
    item_id: number;
    qty: number;
    unit_price: number;
    modifier_ids?: number[];
    notes?: string | null;
    size_label?: string | null;
    lot_batch_id?: number | null;
  },
) {
  return apiFetch<PosCartLine | PosLotPickPayload>(`/api/v1/pos/sessions/${sessionId}/cart-lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function isPosLotPickResponse(
  res: { success: boolean; code?: string; data?: unknown },
): res is { success: false; code: "ERR_POS_LOT_PICK"; data: PosLotPickPayload } {
  return (
    !res.success &&
    res.code === "ERR_POS_LOT_PICK" &&
    !!res.data &&
    typeof res.data === "object" &&
    (res.data as PosLotPickPayload).needs_lot_pick === true
  );
}

export async function fetchItemModifiers(itemId: number): Promise<PosModifierGroup[]> {
  const res = await apiFetch<PosModifierGroup[]>(`/api/v1/pos/catalog/items/${itemId}/modifiers`);
  if (!res.success) throw new Error(res.message ?? "Failed to load modifiers");
  return res.data ?? [];
}

export async function deletePosCartLine(sessionId: number, lineId: number) {
  return apiFetch(`/api/v1/pos/sessions/${sessionId}/cart-lines/${lineId}`, { method: "DELETE" });
}

export async function checkoutPos(
  sessionId: number,
  body: {
    tenders: { tender_type: string; amount: number }[];
    partner_id?: number | null;
    discount_amount?: number;
    voucher_code?: string;
    voucher_amount?: number;
    privilege_type?: string;
    privilege_id_no?: string;
    privilege_name?: string;
    tip_amount?: number;
    table_label?: string;
    order_type?: string;
    guests?: Array<{
      guest_no: number;
      display_name?: string;
      privilege_type: string;
      privilege_id_no?: string;
      privilege_name?: string;
      manual_discount?: number;
    }>;
    commissions?: Array<{
      line_no: number;
      tic_user_id?: number | null;
      tic_name: string;
      calc_mode: string;
      rate_value: number;
    }>;
  },
) {
  return apiFetch<CheckoutResult>(`/api/v1/pos/sessions/${sessionId}/checkout`, { method: "POST", body: JSON.stringify(body) });
}

export type VoidLastResult = {
  sales_id: number;
  sales_no: string;
  grand_total: number;
  journal_action: string;
  or_voided: number;
  reversal_journal_entry_id?: number;
};

/** Reverse the last completed checkout on an open session (no hard-delete). */
export async function voidLastPosCheckout(sessionId: number, reason?: string) {
  return apiFetch<VoidLastResult>(`/api/v1/pos/sessions/${sessionId}/void-last`, {
    method: "POST",
    body: JSON.stringify({ reason: reason?.trim() || "Void last sale at register" }),
  });
}

export async function holdCart(sessionId: number, body: { label: string; order_type: string }) {
  return apiFetch(`/api/v1/pos/sessions/${sessionId}/hold`, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchHeldOrders(): Promise<HeldOrder[]> {
  const res = await apiFetch<HeldOrder[]>("/api/v1/pos/held-orders");
  return res.data ?? [];
}

export async function resumeHeldOrder(id: number) {
  return apiFetch(`/api/v1/pos/held-orders/${id}/resume`, { method: "POST" });
}

export async function deleteHeldOrder(id: number) {
  return apiFetch(`/api/v1/pos/held-orders/${id}`, { method: "DELETE" });
}

export async function addCashMovement(
  sessionId: number,
  body: { movement_type: string; amount: number; reason: string },
) {
  return apiFetch(`/api/v1/pos/sessions/${sessionId}/cash-movements`, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchCashMovements(sessionId: number): Promise<CashMovement[]> {
  const res = await apiFetch<CashMovement[]>(`/api/v1/pos/sessions/${sessionId}/cash-movements`);
  return res.data ?? [];
}

export type SessionActivityEvent = {
  kind: string;
  at: string;
  sales_no?: string;
  sales_id?: number;
  amount?: number;
  label?: string;
  tender?: string;
  voided?: boolean;
};

export type ShiftTxn = {
  sales_id: number;
  sales_no: string;
  at: string;
  grand_total: number;
  voided: boolean;
  tenders: Record<string, number>;
};

export type ZReport = SessionReport & {
  location_name?: string;
  cashier_name?: string;
  opened_at?: string;
  closed_at?: string | null;
  txn_count: number;
  void_count: number;
  transactions: ShiftTxn[];
  cash_movements: CashMovement[];
  generated_at: string;
};

export type DailySessionRow = {
  session_id: number;
  session_no: string;
  location_name: string;
  cashier_name: string;
  status: string;
  sales_total: number;
  opening_cash: number;
  closing_cash?: number | null;
  expected_cash: number;
  variance?: number | null;
  txn_count: number;
};

export type DailyRollup = {
  date: string;
  location_id?: number | null;
  location_name?: string;
  session_count: number;
  sales_total: number;
  txn_count: number;
  void_count: number;
  cash_tenders: number;
  tenders_by_type: Record<string, number>;
  cash_in: number;
  cash_out: number;
  coin_exchange: number;
  sessions: DailySessionRow[];
  generated_at: string;
};

export async function fetchSessionActivity(sessionId: number, limit = 40): Promise<SessionActivityEvent[]> {
  const res = await apiFetch<SessionActivityEvent[]>(`/api/v1/pos/sessions/${sessionId}/activity?limit=${limit}`);
  return res.data ?? [];
}

export async function fetchZReport(sessionId: number): Promise<ZReport | null> {
  const res = await apiFetch<ZReport>(`/api/v1/pos/sessions/${sessionId}/z-report`);
  return res.data ?? null;
}

export async function fetchDailyRollup(date: string, locationId?: number | null): Promise<DailyRollup | null> {
  const qs = new URLSearchParams({ date });
  if (locationId) qs.set("location_id", String(locationId));
  const res = await apiFetch<DailyRollup>(`/api/v1/pos/reports/daily?${qs}`);
  return res.data ?? null;
}

export async function fetchSessionReport(sessionId: number): Promise<SessionReport | null> {
  const res = await apiFetch<SessionReport>(`/api/v1/pos/sessions/${sessionId}/report`);
  return res.data ?? null;
}

export async function fetchPosLogs(): Promise<PosLog[]> {
  const res = await apiFetch<PosLog[]>("/api/v1/pos/logs");
  return res.data ?? [];
}
