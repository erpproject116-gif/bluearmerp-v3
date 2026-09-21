import { describe, expect, it } from "vitest";
import { isSellBuyDesktopPreferredPath } from "./DesktopPreferredHint";
import { shouldShowFloorBottomNav } from "./FloorBottomNav";
import { HOME_SIDEBAR_AREAS, type HomeSidebarArea } from "./ecount-top-nav";
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

function findArea(id: string, areas: HomeSidebarArea[] = HOME_SIDEBAR_AREAS): HomeSidebarArea | undefined {
  for (const a of areas) {
    if (a.id === id) return a;
    const nested = findArea(id, a.children ?? []);
    if (nested) return nested;
  }
  return undefined;
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
  it("nests Sales and Purchase after Manufacturing", () => {
    const ids = HOME_SIDEBAR_AREAS.map((a) => a.id);
    const mfg = ids.indexOf("production");
    const afterMfg = ids.indexOf("sep_after_manufacturing");
    const salesProcess = ids.indexOf("sales_process");
    const purchaseProcess = ids.indexOf("purchase_process");
    expect(afterMfg).toBe(mfg + 1);
    expect(salesProcess).toBe(afterMfg + 1);
    expect(purchaseProcess).toBe(salesProcess + 1);
    expect(HOME_SIDEBAR_AREAS.find((a) => a.id === "sales_process")?.iconId).toBe("sales_process");
    expect(HOME_SIDEBAR_AREAS.find((a) => a.id === "purchase_process")?.iconId).toBe("purchase_process");
    expect(HOME_SIDEBAR_AREAS.find((a) => a.id === "sales_process")?.label).toBe("Sales");
    expect(HOME_SIDEBAR_AREAS.find((a) => a.id === "purchase_process")?.label).toBe("Purchase");
  });

  it("Sales holds Quotation → SO → Sales → Other Invoices → Credit Notes → Customers → AR", () => {
    const sales = HOME_SIDEBAR_AREAS.find((a) => a.id === "sales_process");
    expect(sales?.children?.map((c) => c.id)).toEqual([
      "quotation",
      "sales_order",
      "sell",
      "sales_invoices",
      "credit_notes",
      "customers",
      "accounts_receivable",
    ]);
  });

  it("Purchase holds RFQ → PR → PO → Purchase Receive → Expense → Vendors → Vendor Credits → AP", () => {
    const purchase = HOME_SIDEBAR_AREAS.find((a) => a.id === "purchase_process");
    expect(purchase?.children?.map((c) => c.id)).toEqual([
      "rfq",
      "purchase_request",
      "purchase_order",
      "buy",
      "expense",
      "vendors",
      "vendor_credits",
      "accounts_payable",
    ]);
    expect(purchase?.children?.find((c) => c.id === "buy")?.label).toBe("Purchase Receive");
  });

  it("Manufacturing nested items use distinct icons", () => {
    const mfg = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    const byId = Object.fromEntries((mfg?.children ?? []).map((c) => [c.id, c.iconId]));
    expect(byId.production_workflow).toBe("overview");
    expect(byId.production_all).toBe("production_wo");
    expect(byId.production_assembly).toBe("production_assembly");
    expect(byId.production_disassembly).toBe("production_cutting");
    expect(byId.production_recipe).toBe("production_recipe");
    expect(byId.production_reports).toBe("reports");
    expect(byId.production_setup).toBe("setup");
    const iconIds = (mfg?.children ?? []).map((c) => c.iconId);
    expect(new Set(iconIds).size).toBe(iconIds.length);
  });

  it("Quotation overview is parent landing with list/new/outstanding/history children", () => {
    const quotation = findArea("quotation");
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

  it("Sales keeps core nest; Other Invoices / Customers / AR are Sales siblings", () => {
    const sell = findArea("sell");
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
    expect(sell?.children?.map((c) => c.id)).toEqual([
      "sales_overview",
      "sales_list",
      "sales",
      "sales_outstanding",
      "sales_history",
    ]);

    const salesProcess = HOME_SIDEBAR_AREAS.find((a) => a.id === "sales_process");
    expect(salesProcess?.children?.find((c) => c.id === "customers")?.label).toBe("Customers");
    expect(salesProcess?.children?.find((c) => c.id === "accounts_receivable")?.href).toBe(
      "/app/finance/receivables",
    );
    expect(
      salesProcess?.children?.find((c) => c.id === "sales_invoices")?.children?.map((c) => c.label),
    ).toEqual(["Retainer Invoice", "Recurring Invoice", "Combined Invoice"]);
  });

  it("separates core ERP from Manufacturing and More Apps", () => {
    const ids = HOME_SIDEBAR_AREAS.map((a) => a.id);
    const mfg = ids.indexOf("production");
    const afterMfg = ids.indexOf("sep_after_manufacturing");
    const beforeMore = ids.indexOf("sep_before_more");
    const more = ids.indexOf("more");
    expect(afterMfg).toBe(mfg + 1);
    expect(ids.indexOf("sales_process")).toBe(afterMfg + 1);
    expect(beforeMore).toBeGreaterThan(ids.indexOf("accounting"));
    expect(more).toBe(beforeMore + 1);
    expect(HOME_SIDEBAR_AREAS.find((a) => a.id === "sep_after_manufacturing")?.kind).toBe("separator");
  });

  it("gives RFQ/PR outstanding vs history distinct hrefs", () => {
    const rfq = findArea("rfq");
    expect(rfq?.iconId).toBe("rfq");
    expect(rfq?.children?.find((c) => c.id === "rfq_outstanding")?.href).toBe(
      "/app/purchase-order/rfq?view=outstanding",
    );
    expect(rfq?.children?.find((c) => c.id === "rfq_history")?.href).toBe(
      "/app/purchase-order/rfq?view=history",
    );
    const pr = findArea("purchase_request");
    expect(pr?.children?.find((c) => c.id === "purchase_request_outstanding")?.href).toBe(
      "/app/purchase-request/purchase-requests/status",
    );
    expect(pr?.children?.find((c) => c.id === "purchase_request_history")?.href).toBe(
      "/app/purchase-request/purchase-requests/status?view=history",
    );
  });

  it("RFQ New opens create via ?new=1; Vendors and AP are Purchase siblings", () => {
    const rfq = findArea("rfq");
    expect(rfq?.href).toBe("/app/rfq");
    expect(rfq?.children?.find((c) => c.id === "rfq_new")?.href).toBe("/app/purchase-order/rfq?new=1");

    const buy = findArea("buy");
    expect(buy?.href).toBe("/app/purchases");
    expect(buy?.children?.find((c) => c.id === "purchases")).toMatchObject({
      label: "New Purchase",
      href: "/app/purchases/purchase-receive/new",
    });

    const expense = findArea("expense");
    expect(expense?.href).toBe("/app/expenses");
    expect(expense?.children?.map((c) => c.id)).toEqual([
      "expense_overview",
      "expenses",
      "recurring_expenses",
    ]);

    const purchase = HOME_SIDEBAR_AREAS.find((a) => a.id === "purchase_process");
    expect(purchase?.children?.find((c) => c.id === "vendors")?.label).toBe("Vendors");
    expect(purchase?.children?.find((c) => c.id === "vendor_credits")?.href).toBe(
      "/app/purchases/vendor-credits",
    );
    expect(purchase?.children?.find((c) => c.id === "accounts_payable")?.href).toBe(
      "/app/finance/payables",
    );
  });

  it("Accounting sidebar exposes aging and Profit & Loss", () => {
    const accounting = findArea("accounting");
    expect(accounting?.children?.find((c) => c.id === "ar_aging")?.href).toBe("/app/finance/reports/ar-aging");
    expect(accounting?.children?.find((c) => c.id === "ap_aging")?.href).toBe("/app/finance/reports/ap-aging");
    expect(accounting?.children?.find((c) => c.id === "profit_and_loss")?.href).toBe(
      "/app/finance/acct-i/reports/profit-and-loss",
    );
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
