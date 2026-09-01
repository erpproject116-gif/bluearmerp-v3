import { describe, expect, it } from "vitest";
import { buildCatalog, searchCatalog } from "./navCatalog";

describe("partner findability", () => {
  it("finds customers when searching customer or partner", () => {
    const catalog = buildCatalog();
    const byCustomer = searchCatalog(catalog, "customer", 8);
    expect(byCustomer.some((e) => e.href.includes("/inventory/partners"))).toBe(true);

    const byPartner = searchCatalog(catalog, "partners", 8);
    expect(byPartner.some((e) => e.href.includes("/inventory/partners"))).toBe(true);
  });
});
