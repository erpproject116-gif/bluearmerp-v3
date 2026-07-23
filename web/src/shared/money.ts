// Shared currency helpers. Display formatting (sign, commas, 2 dp) is separate from
// calculation helpers (roundMoney / parseNum) so UI polish never changes math.

export const PESO_SIGN = "\u20B1"; // ₱

/** Active display sign for the tenant default currency. Defaults to Philippine Peso. */
let displayCurrencySign = PESO_SIGN;

/** Call after loading the tenant default currency (AppShell). Does not affect calculations. */
export function setDisplayCurrencySign(sign: string | null | undefined): void {
  const s = (sign ?? "").trim();
  displayCurrencySign = s ? currencyDisplaySign(s) : PESO_SIGN;
}

export function getDisplayCurrencySign(): string {
  return displayCurrencySign || PESO_SIGN;
}

/**
 * Map ISO/code/symbol to the glyph we show in the UI.
 * PHP / DOMESTIC / bare "$" (common mis-format) → ₱. Other ISO codes stay as-is (USD, EUR…).
 */
export function currencyDisplaySign(currencyCodeOrSymbol?: string | null): string {
  const raw = (currencyCodeOrSymbol ?? "").trim();
  if (!raw) return getDisplayCurrencySign();
  if (raw === PESO_SIGN || raw === "P") return PESO_SIGN;
  const upper = raw.toUpperCase();
  if (upper === "PHP" || upper === "DOMESTIC" || upper === "PHP." || upper === "PH") return PESO_SIGN;
  // Mis-tagged peso amounts often show as "$" — treat as peso for this product.
  if (raw === "$" || upper === "PHP$" || upper === "PESO") return PESO_SIGN;
  return raw;
}

export type FormatMoneyOpts = {
  /** false = number only; string = override sign; omit = use tenant display sign */
  sign?: boolean | string;
};

/**
 * Format a money amount for display only: thousands separators + exactly 2 decimals.
 * Example: 1234.5 → "₱1,234.50". Never use the return value in arithmetic — keep numbers raw.
 */
export function formatMoney(n: number, opts?: FormatMoneyOpts): string {
  const value = Number.isFinite(n) ? n : 0;
  const formatted = value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts?.sign === false) return formatted;
  const sign =
    typeof opts?.sign === "string" && opts.sign.trim()
      ? currencyDisplaySign(opts.sign)
      : getDisplayCurrencySign();
  return `${sign}${formatted}`;
}

/**
 * List/print helper: `formatMoneyWithCode(1234.5, "PHP")` → `₱1,234.50` (never `PHP 1,234.50`).
 */
export function formatMoneyWithCode(n: number, currencyCode?: string | null): string {
  return formatMoney(n, { sign: currencyDisplaySign(currencyCode) });
}

/** @deprecated Prefer formatMoney — kept as alias for existing call sites. */
export function formatPeso(n: number, opts?: { sign?: boolean }): string {
  return formatMoney(n, opts);
}

/** Format without currency sign — spreadsheet cells and compact tables. */
export function formatAmount(n: number): string {
  return formatMoney(n, { sign: false });
}

/** Match api roundMoney / taxcalc round4 (4 decimal places) — calculation only. */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/**
 * Strip display formatting (currency signs, thousand commas, spaces) before Number().
 * Safe for pasted "₱1,234.50" / "PHP 1,234.50" without affecting how we store/calculate amounts.
 */
export function stripMoneyFormatting(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\u20B1/g, "") // ₱
    .replace(/\$/g, "")
    .replace(/\bPHP\b/gi, "")
    .replace(/\bDOMESTIC\b/gi, "")
    .replace(/[$€£¥]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
}

/** Parse a numeric string for calculations; invalid/empty → 0 (grid totals, API payloads). */
export function parseNum(s: string): number {
  const v = stripMoneyFormatting(s);
  if (!v || v === "." || v === "-" || v === "-.") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sanitize free-typed currency input. Digits + one decimal point; max 2 fractional digits.
 * Thousand commas and currency signs are stripped (not treated as decimal separators).
 */
export function sanitizeDecimalInput(raw: string): string {
  let v = stripMoneyFormatting(raw).replace(/[^0-9.-]/g, "");
  // Keep a single leading minus for credit/debit entry if present.
  const neg = v.startsWith("-");
  v = v.replace(/-/g, "");
  if (neg) v = "-" + v;
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
  let v = stripMoneyFormatting(raw).replace(/[^0-9.]/g, "");
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
  const v = stripMoneyFormatting(raw).trim();
  if (!v || v === "." || v === "-" || v === "-.") return null;
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
