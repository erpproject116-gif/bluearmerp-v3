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

  it("hides raw sql/internal messages", () => {
    expect(formatPosCashierError({ message: "pq: relation foo does not exist" })).toMatch(/manager/i);
  });
});
