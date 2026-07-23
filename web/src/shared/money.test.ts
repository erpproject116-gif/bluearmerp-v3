import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatMoney,
  formatMoneyWithCode,
  currencyDisplaySign,
  parseNum,
  sanitizeDecimalInput,
  setDisplayCurrencySign,
  PESO_SIGN,
} from "./money";

describe("money formatting", () => {
  it("formats with thousands separators and 2 decimals", () => {
    setDisplayCurrencySign(PESO_SIGN);
    expect(formatMoney(1234.5)).toBe("₱1,234.50");
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatMoney(1000000)).toBe("₱1,000,000.00");
  });

  it("maps PHP / $ codes to peso sign", () => {
    setDisplayCurrencySign(PESO_SIGN);
    expect(formatMoneyWithCode(1234.5, "PHP")).toBe("₱1,234.50");
    expect(formatMoneyWithCode(10, "$")).toBe("₱10.00");
    expect(currencyDisplaySign("DOMESTIC")).toBe(PESO_SIGN);
    expect(currencyDisplaySign("USD")).toBe("USD");
  });

  it("parseNum strips display formatting without changing math", () => {
    expect(parseNum("₱1,234.50")).toBe(1234.5);
    expect(parseNum("PHP 1,000.00")).toBe(1000);
    expect(parseNum("1,000.00")).toBe(1000);
    expect(parseNum("12.3")).toBe(12.3);
  });

  it("sanitizeDecimalInput strips commas as thousands separators", () => {
    expect(sanitizeDecimalInput("1,234.56")).toBe("1234.56");
    expect(sanitizeDecimalInput("₱99.9")).toBe("99.9");
    expect(sanitizeDecimalInput("12.345")).toBe("12.34");
  });
});
