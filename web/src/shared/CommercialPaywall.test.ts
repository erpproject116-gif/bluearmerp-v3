import { describe, expect, it } from "vitest";
import { isCommercialTradeAppPath } from "./CommercialPaywall";

describe("isCommercialTradeAppPath", () => {
  it("treats sell/buy as trade screens", () => {
    expect(isCommercialTradeAppPath("/app/sales/sales")).toBe(true);
    expect(isCommercialTradeAppPath("/app/purchase-order/purchase-orders")).toBe(true);
    expect(isCommercialTradeAppPath("/app/pos")).toBe(true);
  });

  it("does not treat production or inventory as trade screens", () => {
    expect(isCommercialTradeAppPath("/app/production")).toBe(false);
    expect(isCommercialTradeAppPath("/app/production/orders/new")).toBe(false);
    expect(isCommercialTradeAppPath("/app/inventory/items")).toBe(false);
    expect(isCommercialTradeAppPath("/app/dashboard")).toBe(false);
  });

  it("treats only listed trade prefixes as locked screens", () => {
    expect(isCommercialTradeAppPath("/app/comms/chat")).toBe(false);
    expect(isCommercialTradeAppPath("/app/crm/notifications")).toBe(false);
  });
});
