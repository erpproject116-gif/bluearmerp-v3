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
  it("parent Sales opens the sales overview; New Sales and Sales List are children", () => {
    const sell = HOME_SIDEBAR_AREAS.find((a) => a.id === "sell");
    expect(sell?.href).toBe("/app/sales");
    expect(sell?.children?.find((c) => c.id === "sales_overview")).toMatchObject({
      label: "Sales",
      href: "/app/sales",
    });
    expect(sell?.children?.find((c) => c.id === "sales")).toMatchObject({
      label: "New Sales",
      href: "/app/sales/sales/new",
    });
    expect(sell?.children?.find((c) => c.id === "sales_list")).toMatchObject({
      label: "Sales List",
      href: "/app/sales/sales",
    });
    expect(sell?.children?.find((c) => c.id === "customers")?.label).toBe("Customers");
    expect(sell?.children?.find((c) => c.id === "sales_invoices")?.children?.map((c) => c.label)).toEqual([
      "Retainer Invoice",
      "Recurring Invoice",
      "Combined Invoice",
    ]);
    expect(sell?.children?.[0]?.href).toBe(sell?.href);
  });

  it("parent Purchase opens the purchase overview; receive new and list are children", () => {
    const buy = HOME_SIDEBAR_AREAS.find((a) => a.id === "buy");
    expect(buy?.href).toBe("/app/purchases");
    expect(buy?.children?.find((c) => c.id === "purchase_overview")).toMatchObject({
      label: "Purchase",
      href: "/app/purchases",
    });
    expect(buy?.children?.find((c) => c.id === "purchase_order")?.href).toBe(
      "/app/purchase-order/purchase-orders",
    );
    expect(buy?.children?.find((c) => c.id === "purchases")).toMatchObject({
      label: "Purchase Receive",
      href: "/app/purchases/purchase-receive/new",
    });
    expect(buy?.children?.find((c) => c.id === "purchase_receive_list")).toMatchObject({
      label: "Purchase Receive List",
      href: "/app/purchases/purchase-receive",
    });
    expect(buy?.children?.find((c) => c.id === "vendors")?.label).toBe("Vendors");
    expect(buy?.children?.[0]?.href).toBe(buy?.href);
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
