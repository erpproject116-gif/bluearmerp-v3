import { describe, expect, it } from "vitest";
import type { PosCatalogItem } from "../../shared/usePos";
import { resolvePosScan } from "./posScan";

const item = (partial: Partial<PosCatalogItem> & Pick<PosCatalogItem, "id" | "item_code" | "item_name">): PosCatalogItem => ({
  price: 100,
  track_inventory_qty: true,
  has_modifiers: false,
  ...partial,
});

describe("resolvePosScan", () => {
  it("matches exact item_code first", async () => {
    const catalog = [item({ id: 1, item_code: "SKU-1", item_name: "Phone" }), item({ id: 2, item_code: "SKU-2", item_name: "Case" })];
    const r = await resolvePosScan({ code: "sku-1", catalog, locationId: 9 });
    expect(r.kind).toBe("item");
    if (r.kind === "item") expect(r.item.id).toBe(1);
  });

  it("flags ambiguous partial matches", async () => {
    const catalog = [
      item({ id: 1, item_code: "AA-1", item_name: "Adapter USB" }),
      item({ id: 2, item_code: "AA-2", item_name: "Adapter HDMI" }),
    ];
    const r = await resolvePosScan({ code: "Adapter", catalog, locationId: 9 });
    expect(r.kind).toBe("ambiguous");
  });
});
