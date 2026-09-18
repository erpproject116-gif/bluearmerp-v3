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
    expect(isSellBuyDesktopPreferredPath("/app/rfq")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/expenses")).toBe(true);
    expect(isSellBuyDesktopPreferredPath("/app/production")).toBe(false);
  });
});

describe("HOME_SIDEBAR_AREAS document area landings", () => {
  it("places Quotation → Sales Order → Sales after Manufacturing", () => {
    const ids = HOME_SIDEBAR_AREAS.map((a) => a.id);
    const mfg = ids.indexOf("production");
    const quotation = ids.indexOf("quotation");
    const salesOrder = ids.indexOf("sales_order");
    const sell = ids.indexOf("sell");
    expect(mfg).toBeGreaterThanOrEqual(0);
    expect(quotation).toBeGreaterThan(mfg);
    expect(salesOrder).toBeGreaterThan(quotation);
    expect(sell).toBeGreaterThan(salesOrder);
  });

  it("Quotation overview is parent landing with list/new/outstanding/history children", () => {
    const quotation = HOME_SIDEBAR_AREAS.find((a) => a.id === "quotation");
    expect(quotation?.href).toBe("/app/quotation");
    expect(quotation?.children?.map((c) => c.id)).toEqual([
      "quotation_overview",
      "quotation_list",
      "quotation_new",
      "quotation_outstanding",
      "quotation_history",
    ]);
    expect(quotation?.children?.[0]?.href).toBe(quotation?.href);
  });

  it("Sales keeps Other Invoices nest plus Customers and AR", () => {
    const sell = HOME_SIDEBAR_AREAS.find((a) => a.id === "sell");
    expect(sell?.href).toBe("/app/sales");
    expect(sell?.children?.find((c) => c.id === "sales_overview")).toMatchObject({
      label: "Sales Overview",
      href: "/app/sales",
    });
    expect(sell?.children?.find((c) => c.id === "sales")).toMatchObject({
      label: "New sales",
      href: "/app/sales/sales/new",
    });
    expect(sell?.children?.find((c) => c.id === "sales_list")?.href).toBe("/app/sales/sales");
    expect(sell?.children?.find((c) => c.id === "customers")?.label).toBe("Customers");
    expect(sell?.children?.find((c) => c.id === "sales_invoices")?.children?.map((c) => c.label)).toEqual([
      "Retainer Invoice",
      "Recurring Invoice",
      "Combined Invoice",
    ]);
  });

  it("procurement order is RFQ → PR → PO → Purchase → Expense", () => {
    const ids = HOME_SIDEBAR_AREAS.map((a) => a.id);
    const rfq = ids.indexOf("rfq");
    const pr = ids.indexOf("purchase_request");
    const po = ids.indexOf("purchase_order");
    const buy = ids.indexOf("buy");
    const expense = ids.indexOf("expense");
    expect(rfq).toBeGreaterThan(ids.indexOf("sell"));
    expect(pr).toBeGreaterThan(rfq);
    expect(po).toBeGreaterThan(pr);
    expect(buy).toBeGreaterThan(po);
    expect(expense).toBeGreaterThan(buy);
  });

  it("RFQ New opens create via ?new=1; Expense holds vendors and AP", () => {
    const rfq = HOME_SIDEBAR_AREAS.find((a) => a.id === "rfq");
    expect(rfq?.href).toBe("/app/rfq");
    expect(rfq?.children?.find((c) => c.id === "rfq_new")?.href).toBe("/app/purchase-order/rfq?new=1");

    const buy = HOME_SIDEBAR_AREAS.find((a) => a.id === "buy");
    expect(buy?.href).toBe("/app/purchases");
    expect(buy?.children?.find((c) => c.id === "purchases")).toMatchObject({
      label: "New Purchase",
      href: "/app/purchases/purchase-receive/new",
    });

    const expense = HOME_SIDEBAR_AREAS.find((a) => a.id === "expense");
    expect(expense?.href).toBe("/app/expenses");
    expect(expense?.children?.find((c) => c.id === "vendors")?.label).toBe("Vendors");
    expect(expense?.children?.find((c) => c.id === "accounts_payable")?.href).toBe("/app/finance/payables");
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
