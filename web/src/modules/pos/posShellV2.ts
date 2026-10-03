/**
 * Cashier-first POS shell v2 — feature flag.
 * Read once at module load so a mid-session toggle cannot hot-swap chrome.
 *
 * Enable: localStorage.setItem("pos_cashier_shell_v2", "1") then reload,
 * or VITE_POS_CASHIER_SHELL_V2=true at build time.
 */
import type { PosReceiptFormat } from "../../shared/usePos";

function readPosCashierShellV2(): boolean {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_POS_CASHIER_SHELL_V2 === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem("pos_cashier_shell_v2");
      if (v === "1" || v === "true") return true;
      if (v === "0" || v === "false") return false;
    }
  } catch {
    /* ignore */
  }
  // Default OFF until staging pilots pass (master plan Phase 7).
  return false;
}

/** Frozen for the lifetime of this JS bundle / page load. */
export const POS_CASHIER_SHELL_V2 = readPosCashierShellV2();

export type PosLastCheckout = {
  sales_id: number;
  sales_no: string;
  grand_total: number;
  change: number;
  journal_entry_id?: number | null;
  official_receipt_id?: number | null;
  tender_label: string;
  at: string;
  receipt_format?: PosReceiptFormat | null;
};

const RECENT_KEY = "pos_recent_checkouts";

export function pushRecentCheckout(sessionId: number, row: PosLastCheckout, max = 10): void {
  try {
    const key = `${RECENT_KEY}:${sessionId}`;
    const prev = JSON.parse(sessionStorage.getItem(key) || "[]") as PosLastCheckout[];
    const next = [row, ...prev.filter((r) => r.sales_id !== row.sales_id)].slice(0, max);
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function listRecentCheckouts(sessionId: number): PosLastCheckout[] {
  try {
    const key = `${RECENT_KEY}:${sessionId}`;
    return JSON.parse(sessionStorage.getItem(key) || "[]") as PosLastCheckout[];
  } catch {
    return [];
  }
}

/** Screen fallback when API did not return receipt_format. */
export function fallbackReceiptFromCheckout(
  row: PosLastCheckout,
  companyName?: string,
): PosReceiptFormat {
  if (row.receipt_format) return row.receipt_format;
  const hasOr = !!row.official_receipt_id;
  return {
    doc_title: hasOr ? "Official Receipt" : "Sales slip",
    company_name: companyName || "Store",
    sales_no: row.sales_no,
    official_receipt_id: row.official_receipt_id,
    at: row.at,
    lines: [],
    subtotal: row.grand_total,
    discount: 0,
    tax: 0,
    tip: 0,
    grand_total: row.grand_total,
    change: row.change,
    tenders: [{ tender_type: row.tender_label || "cash", amount: row.grand_total }],
    footer_note: hasOr
      ? "Official receipt on file — keep for your records."
      : "Counter confirmation — not titled Official Receipt unless an OR number is shown.",
  };
}
