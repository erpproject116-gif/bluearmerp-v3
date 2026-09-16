import { describe, expect, it } from "vitest";
import { isSellBuyDesktopPreferredPath } from "./DesktopPreferredHint";
import { shouldShowFloorBottomNav } from "./FloorBottomNav";
import { HOME_SIDEBAR_AREAS } from "./ecount-top-nav";
import type { MeData } from "../shared/auth-context";

function me(overrides: Partial<MeData["user"]> & { moduleCodes?: string[] } = {}): MeData {
  const { moduleCodes, ...userOverrides } = overrides;
  const codes = moduleCodes ?? ["manufacturing", "inventory", "comms"];
  return {
    user: {
      id: 1,
      email: "a@b.c",
      full_name: "A",
      is_tenant_owner: false,
      is_store_admin: false,
      is_platform_superadmin: false,
      permissions: { "manufacturing.work_orders": "write" },
      ...userOverrides,
    },
    tenant: {
      id: 1,
      company_name: "Co",
      company_code: "CO",
      status: "active",
    },
    enabled_module_codes: codes,
    modules: codes.map((module_code) => ({
      module_code,
      module_name: module_code,
      is_enabled: true,
    })),
  };
}

describe("isSellBuyDesktopPreferredPath", () => {
  it("matches sell and buy prefixes", () => {
    expect(isSellBuyDesktopPreferredPath("/app/sales/sales")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/purchase-order/rfq")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/production")).toBe(false);
  });
});

describe("HOME_SIDEBAR_AREAS sales/purchase landings", () => {
  it("parent Sales opens the sales list; New Sales is a child shortcut", () => {
    const sell = HOME_SIDEBAR_AREAS.find((a) => a.id === "sell");
    expect(sell?.href).toBe("/app/sales/sales");
    expect(sell?.children?.find((c) => c.id === "sales")).toMatchObject({
      label: "New Sales",
      href: "/app/sales/sales/new",
    });
    // Parent landing must stay on the list even though no child duplicates that href.
    expect(sell?.children?.[0]?.href).not.toBe(sell?.href);
  });

  it("parent Purchase opens the purchases list, not purchase orders", () => {
    const buy = HOME_SIDEBAR_AREAS.find((a) => a.id === "buy");
    expect(buy?.href).toBe("/app/purchases/purchase-receive");
    expect(buy?.children?.find((c) => c.id === "purchase_order")?.href).toBe(
      "/app/purchase-order/purchase-orders",
    );
    expect(buy?.children?.find((c) => c.id === "purchases")).toMatchObject({
      label: "New Purchases",
      href: "/app/purchases/purchase-receive/new",
    });
    expect(buy?.children?.[0]?.href).not.toBe(buy?.href);
  });
});

describe("shouldShowFloorBottomNav", () => {
  it("always shows in standalone", () => {
    expect(shouldShowFloorBottomNav(true, false, me())).toBe(true);
  });

  it("shows on narrow only with manufacturing access", () => {
    expect(shouldShowFloorBottomNav(false, true, me())).toBe(true);
    expect(
      shouldShowFloorBottomNav(
        false,
        true,
        me({ permissions: { sales: "write" }, moduleCodes: ["sales"] }),
      ),
    ).toBe(false);
  });
});
