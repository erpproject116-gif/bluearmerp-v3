import { describe, expect, it } from "vitest";
import { isSellBuyDesktopPreferredPath } from "./DesktopPreferredHint";
import { shouldShowFloorBottomNav } from "./FloorBottomNav";
import type { MeData } from "../shared/auth-context";

function me(partial: Partial<MeData["user"]> & { modules?: string[] }): MeData {
  return {
    user: {
      id: "1",
      email: "a@b.c",
      full_name: "A",
      is_tenant_owner: false,
      is_store_admin: false,
      is_platform_superadmin: false,
      permissions: { "manufacturing.work_orders": "write" },
      ...partial,
    },
    tenant: { id: "t", company_name: "Co" },
    enabled_module_codes: partial.modules ?? ["manufacturing", "inventory", "comms"],
    modules: (partial.modules ?? ["manufacturing"]).map((module_code) => ({
      module_code,
      module_name: module_code,
      is_enabled: true,
    })),
  } as MeData;
}

describe("isSellBuyDesktopPreferredPath", () => {
  it("matches sell and buy prefixes", () => {
    expect(isSellBuyDesktopPreferredPath("/app/sales/sales")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/purchase-order/rfq")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/production")).toBe(false);
  });
});

describe("shouldShowFloorBottomNav", () => {
  it("always shows in standalone", () => {
    expect(shouldShowFloorBottomNav(true, false, me({}))).toBe(true);
  });

  it("shows on narrow only with manufacturing access", () => {
    expect(shouldShowFloorBottomNav(false, true, me({}))).toBe(true);
    expect(
      shouldShowFloorBottomNav(
        false,
        true,
        me({ permissions: { sales: "write" }, modules: ["sales"] }),
      ),
    ).toBe(false);
  });
});
