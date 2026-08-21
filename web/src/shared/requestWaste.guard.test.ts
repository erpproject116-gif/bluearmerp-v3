/**
 * Guard: the request-waste fixes from the "no Redis" DB-hit reduction pass are
 * easy to undo by habit (re-adding `staleTime: 0` to a new list hook, pasting a
 * second poll, restoring the belt-and-braces refetch). Source-scan style mirrors
 * moneyCallSites.guard.test.ts — if a marker legitimately moves, update this test
 * together with the code.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SHARED = __dirname;

/** List hooks that must inherit the 30s global staleTime from queryClient.ts. */
const LIST_HOOKS = [
  "useQuotationList.ts",
  "useSalesList.ts",
  "useSalesOrderList.ts",
  "usePurchaseOrderList.ts",
  "usePurchaseRequestList.ts",
  "useGoodsReceiptList.ts",
  "useSupplierInvoiceList.ts",
  "useOfficialReceiptList.ts",
  "usePaymentVoucherList.ts",
  "useRepairOrderList.ts",
  "useInventoryList.ts",
  "useSerialLotList.ts",
  "useActivityLogList.ts",
  "useChangeLogList.ts",
];

const read = (file: string) => fs.readFileSync(path.resolve(SHARED, file), "utf8");

describe("list hooks inherit the global staleTime", () => {
  it.each(LIST_HOOKS)("%s does not pin staleTime to 0", (file) => {
    expect(read(file)).not.toMatch(/staleTime:\s*0\b/);
  });

  it("queryClient still defines a non-zero default", () => {
    expect(read("queryClient.ts")).toMatch(/staleTime:\s*30_000/);
  });
});

describe("mutation invalidation fetches once", () => {
  const src = read("queryInvalidation.ts");

  it("invalidates active queries", () => {
    expect(src).toMatch(/invalidateQueries\(\{\s*predicate,\s*refetchType:\s*"active"\s*\}\)/);
  });

  it("does not follow up with a redundant refetchQueries", () => {
    expect(src).not.toContain("refetchQueries(");
  });
});

describe("query client avoids focus storms", () => {
  it("defaults refetchOnWindowFocus to false", () => {
    expect(read("queryClient.ts")).toMatch(/refetchOnWindowFocus:\s*false/);
  });
});

describe("dashboard polls stay under the auth RPM budget", () => {
  it("summary and red-flags poll at most every 120s", () => {
    const src = read("useDashboard.ts");
    expect(src).toMatch(/refetchInterval:.*120_000/);
    expect(src).not.toMatch(/refetchInterval:.*\? 60_000/);
  });
});

describe("shell polling", () => {
  it("bell and toast poller share one notification feed", () => {
    expect(read("CrmNotificationBell.tsx")).toContain("useCrmNotificationFeed");
    expect(read("CrmNotificationPoller.tsx")).toContain("useCrmNotificationFeed");
    // Neither may build its own params object, which would create a second poll.
    expect(read("CrmNotificationPoller.tsx")).not.toContain("unreadOnly: true");
  });

  it("poller only toasts warning and critical", () => {
    const src = read("CrmNotificationPoller.tsx");
    expect(src).toContain('n.severity !== "warning"');
    expect(src).toContain('n.severity !== "critical"');
  });

  it("presence heartbeat stops while the tab is hidden", () => {
    const src = read("PresenceHeartbeat.tsx");
    expect(src).toContain("document.hidden");
    expect(src).toMatch(/stopTimer\(\)/);
  });

  it("usage heartbeat skips the POST while the tab is hidden", () => {
    const src = read("UsageTracker.tsx");
    expect(src).toMatch(/if \(!force && typeof document !== "undefined" && document\.hidden\) return;/);
    // pagehide must still flush.
    expect(src).toContain("sendHeartbeat(true)");
  });
});

describe("shared modal lookups", () => {
  it("document modals use the shared location lookup instead of a local copy", () => {
    const modals = [
      "../modules/quotation/quotation/QuotationModal.tsx",
      "../modules/sales-order/sales-order/SalesOrderModal.tsx",
      "../modules/sales/sales/SalesModal.tsx",
      "../modules/purchase-request/purchase-request/PurchaseRequestModal.tsx",
      "../modules/purchase-request/purchase-order/PurchaseOrderModal.tsx",
      "../modules/finance/supplier-invoices/SupplierInvoiceModal.tsx",
    ];
    for (const modal of modals) {
      const src = read(modal);
      expect(src, modal).toContain("fetchLocationOptions");
      expect(src, modal).not.toMatch(/async function fetchLocations\(/);
    }
  });

  it("document modals use the shared partner lookup instead of a local copy", () => {
    const modals = [
      "../modules/quotation/quotation/QuotationModal.tsx",
      "../modules/sales-order/sales-order/SalesOrderModal.tsx",
      "../modules/sales/sales/SalesModal.tsx",
      "../modules/purchase-request/purchase-order/PurchaseOrderModal.tsx",
      "../modules/finance/supplier-invoices/SupplierInvoiceModal.tsx",
    ];
    for (const modal of modals) {
      const src = read(modal);
      expect(src, modal).toContain("fetchPartnerOptions");
      expect(src, modal).not.toMatch(/async function fetch(Partners|Vendors)\(/);
    }
  });

  it("only the unfiltered first page is cached", () => {
    const src = read("useDocumentLookups.ts");
    expect(src).toContain("ACTIVE_LOCATIONS_KEY");
    expect(src).toContain("ACTIVE_PARTNERS_KEY");
    // Both helpers must bail out to a live request when the user types.
    expect(src.match(/if \(term\) \{/g) ?? []).toHaveLength(2);
  });
});
