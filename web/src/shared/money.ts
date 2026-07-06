// Shared currency helpers. The platform's base currency is the Philippine Peso,
// so amounts are shown with the peso sign instead of a currency code/name.

export const PESO_SIGN = "\u20B1"; // ₱

/** Format a number as pesos, e.g. 1234.5 -> "₱1,234.50". Pass { sign: false } to omit the sign. */
export function formatPeso(n: number, opts?: { sign?: boolean }): string {
  const value = Number.isFinite(n) ? n : 0;
  const s = value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opts?.sign === false ? s : `${PESO_SIGN}${s}`;
}

/** Format without the peso sign — for spreadsheet cells and compact tables. */
export function formatAmount(n: number): string {
  return formatPeso(n, { sign: false });
}

/** Match api roundMoney / taxcalc round4 (4 decimal places). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Parse a numeric string for calculations; invalid/empty → 0 (grid totals, API payloads). */
export function parseNum(s: string): number {
  const v = s.trim();
  if (!v || v === ".") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sanitize free-typed numeric input so users can type continuously (unlike a
 * native number input). Allows digits and a single decimal point only (max 2
 * fractional digits for currency).
 */
export function sanitizeDecimalInput(raw: string): string {
  let v = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    const intPart = v.slice(0, firstDot);
    const fracPart = v.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
    v = intPart + "." + fracPart;
  }
  return v;
}

/** Quantity fields — up to 4 fractional digits. */
export function sanitizeQtyInput(raw: string): string {
  let v = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    const intPart = v.slice(0, firstDot);
    const fracPart = v.slice(firstDot + 1).replace(/\./g, "").slice(0, 4);
    v = intPart + "." + fracPart;
  }
  return v;
}

/** Digits only — for sort order, max select, and other whole-number fields. */
export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/** Parse a sanitized decimal string; null while the user is mid-entry (e.g. "" or "1."). */
export function parseDecimalInput(raw: string): number | null {
  const v = raw.trim();
  if (!v || v === ".") return null;
  if (v.endsWith(".")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Call from onInput so the visible value stays in sync with the sanitized value. */
export function bindDecimalInput(el: HTMLInputElement, setter: (v: string) => void): void {
  const v = sanitizeDecimalInput(el.value);
  if (el.value !== v) el.value = v;
  setter(v);
}

export function bindQtyInput(el: HTMLInputElement, setter: (v: string) => void): void {
  const v = sanitizeQtyInput(el.value);
  if (el.value !== v) el.value = v;
  setter(v);
}

/** POS order-level tax preview — mirrors api/internal/modules/pos checkout rounding. */
export function computePosOrderTax(
  subtotalAfterDiscount: number,
  taxMode: string,
  ratePercent: number,
  taxInclusiveSetting: boolean,
): { subtotal: number; tax: number; total: number } {
  const base = roundMoney(subtotalAfterDiscount);
  let mode = taxMode;
  if (mode === "included" && !taxInclusiveSetting) mode = "excluded";

  if (mode === "included") {
    const tax = roundMoney((base * ratePercent) / (100 + ratePercent));
    const subtotal = roundMoney(base - tax);
    return { subtotal, tax, total: base };
  }
  if (mode === "excluded") {
    const tax = roundMoney((base * ratePercent) / 100);
    return { subtotal: base, tax, total: roundMoney(base + tax) };
  }
  return { subtotal: base, tax: 0, total: base };
}
