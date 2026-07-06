// Shared currency helpers. The platform's base currency is the Philippine Peso,
// so amounts are shown with the peso sign instead of a currency code/name.

export const PESO_SIGN = "\u20B1"; // ₱

/** Format a number as pesos, e.g. 1234.5 -> "₱1,234.50". Pass { sign: false } to omit the sign. */
export function formatPeso(n: number, opts?: { sign?: boolean }): string {
  const value = Number.isFinite(n) ? n : 0;
  const s = value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opts?.sign === false ? s : `${PESO_SIGN}${s}`;
}

/**
 * Sanitize free-typed numeric input so users can type continuously (unlike a
 * native number input). Allows digits and a single decimal point only.
 */
export function sanitizeDecimalInput(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  return v;
}

/** Digits only — for qty, sort order, and other whole-number fields. */
export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}
