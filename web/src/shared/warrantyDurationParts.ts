/** Split total months into years + remainder months for dual dropdowns. */
export function warrantyYearsPart(total: number | null | undefined): number {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  return Math.floor(n / 12);
}

export function warrantyMonthsPart(total: number | null | undefined): number {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  return n % 12;
}

export function warrantyFromParts(years: number, months: number): number {
  const y = Math.max(0, Math.min(20, Math.floor(Number(years) || 0)));
  const m = Math.max(0, Math.min(11, Math.floor(Number(months) || 0)));
  return y * 12 + m;
}

export const WARRANTY_YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => i); // 0–10
export const WARRANTY_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i); // 0–11
