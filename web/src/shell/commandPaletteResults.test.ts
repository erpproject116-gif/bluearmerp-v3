import { describe, expect, it } from "vitest";
import { buildPaletteResults, normalizePalettePath, paletteItemLabel } from "./commandPaletteResults";
import type { NavCatalogEntry } from "./navCatalog";

const catalog: NavCatalogEntry[] = [
  { label: "Sales › Sales List", href: "/app/sales/sales", group: "Sales" },
];

describe("normalizePalettePath", () => {
  it("accepts absolute app paths", () => {
    expect(normalizePalettePath("/app/sales/sales")).toBe("/app/sales/sales");
  });

  it("accepts paths without a leading slash", () => {
    expect(normalizePalettePath("app/sales/sales")).toBe("/app/sales/sales");
  });

  it("ignores plain search text", () => {
    expect(normalizePalettePath("how to post a sale")).toBeNull();
  });
});

describe("buildPaletteResults", () => {
  it("always offers Baiko and site map for free-text queries", () => {
    const results = buildPaletteResults({
      query: "how do I import partners",
      catalog,
      quickActions: [],
      recent: [],
      pathname: "/app/dashboard",
      canAccess: () => true,
    });
    expect(results[0]?.kind).toBe("ask");
    expect(results.some((r) => r.kind === "sitemap")).toBe(true);
    expect(paletteItemLabel(results[0]!)).toContain("Ask Baiko");
  });

  it("includes a go-to row for typed paths", () => {
    const results = buildPaletteResults({
      query: "/app/sales/sales",
      catalog,
      quickActions: [],
      recent: [],
      pathname: "/app/dashboard",
      canAccess: () => true,
    });
    expect(results.some((r) => r.kind === "goto" && r.path === "/app/sales/sales")).toBe(true);
  });
});
