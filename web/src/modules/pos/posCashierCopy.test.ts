import { describe, expect, it } from "vitest";
import { formatPosCashierError } from "./posCashierCopy";

describe("formatPosCashierError", () => {
  it("maps known codes", () => {
    expect(formatPosCashierError({ code: "ERR_FORBIDDEN" })).toMatch(/permission/i);
  });

  it("softens stock validation", () => {
    expect(
      formatPosCashierError({ errors: { stock: "insufficient quantity at location" } }),
    ).toMatch(/stock/i);
  });

  it("prefers lot field errors over generic ERR_VALIDATION", () => {
    expect(
      formatPosCashierError({
        code: "ERR_VALIDATION",
        errors: { cart: "line 1: lot batch is required for this item" },
      }),
    ).toMatch(/lot/i);
  });

  it("hides raw sql/internal messages", () => {
    expect(formatPosCashierError({ message: "pq: relation foo does not exist" })).toMatch(/manager/i);
  });
});
