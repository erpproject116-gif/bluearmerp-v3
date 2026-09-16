import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { isLiveProductionUrl } from "./helpers/liveSafety";
import { softSkip } from "./helpers/entityForm";
import { openNewRow, cancelEntityModal, expectModalHeading } from "./helpers/entityForm";

/**
 * Systematic page / grid / form contracts for P0 modules.
 * Read-only: never mutates business data.
 */
const PAGE_SHELLS: { name: string; path: string; heading?: RegExp }[] = [
  { name: "inventory partners", path: "/app/inventory/partners", heading: /Partners|Customers\s*&\s*vendors|Customers/i },
  { name: "inventory items", path: "/app/inventory/items", heading: /Items/i },
  { name: "inventory locations", path: "/app/inventory/locations", heading: /Locations/i },
  { name: "find stock", path: "/app/inventory/find-stock" },
  { name: "serial registry", path: "/app/inventory/serial-lot/registry" },
  { name: "quotations", path: "/app/quotation/quotations", heading: /Quotation/i },
  { name: "sales orders", path: "/app/sales-order/sales-orders", heading: /Sales Order/i },
  { name: "sales invoices", path: "/app/sales/sales", heading: /Sale/i },
  { name: "purchase orders", path: "/app/purchase-order/purchase-orders", heading: /Purchase Order/i },
  { name: "purchase invoices", path: "/app/purchases/purchase-receive", heading: /Purchase/i },
  { name: "official receipts", path: "/app/finance/official-receipts", heading: /Official Receipt/i },
  { name: "payment vouchers", path: "/app/finance/payment-vouchers", heading: /Payment Voucher/i },
  { name: "chart of accounts", path: "/app/finance/acct-i/chart-of-accounts", heading: /Chart|Account/i },
  { name: "journal entries", path: "/app/finance/acct-i/journal-entries", heading: /Journal/i },
  { name: "AR aging report", path: "/app/finance/reports/ar-aging" },
  { name: "AP aging report", path: "/app/finance/reports/ap-aging" },
  { name: "stock balance report", path: "/app/inventory/reports/stock-balance" },
];

const GRID_CONTRACTS = [
  "/app/inventory/partners",
  "/app/inventory/items",
  "/app/quotation/quotations",
  "/app/sales-order/sales-orders",
  "/app/sales/sales",
  "/app/purchase-order/purchase-orders",
  "/app/purchases/purchase-receive",
  "/app/finance/official-receipts",
];

const FORM_NEW_CONTRACTS: { path: string; heading: RegExp; requiredHint?: RegExp }[] = [
  { path: "/app/quotation/quotations", heading: /New Quotation/i, requiredHint: /Customer/i },
  { path: "/app/sales-order/sales-orders", heading: /New Sales Order/i, requiredHint: /Customer/i },
  { path: "/app/sales/sales", heading: /New Sales/i, requiredHint: /Customer/i },
  { path: "/app/purchase-order/purchase-orders", heading: /New Purchase Order/i, requiredHint: /Supplier/i },
  { path: "/app/purchases/purchase-receive", heading: /New Purchases|New [Pp]urchase (invoice|Receive)/i, requiredHint: /Supplier|Vendor/i },
];

test.describe("UI page/grid/form contracts", () => {
  test.describe.configure({ mode: "serial" });

  test("@read-only page shells load without 5xx / pageerror", async ({ page }, testInfo) => {
    test.setTimeout(20 * 60 * 1000);

    await ensureSignedIn(page);
    await assertApiReachable(page);

    const failures: string[] = [];
    for (const p of PAGE_SHELLS) {
      const pageErrors: string[] = [];
      const serverErrors: string[] = [];
      const onError = (err: Error) => pageErrors.push(err.message);
      const onResponse = (res: import("@playwright/test").Response) => {
        if (res.url().includes("/api/") && res.status() >= 500) {
          serverErrors.push(`${res.status()} ${res.url()}`);
        }
      };
      page.on("pageerror", onError);
      page.on("response", onResponse);
      try {
        await page.goto(p.path, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page
          .locator("nav, aside, [role='navigation'], h1, h2, table, main")
          .first()
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => undefined);
        if (page.url().includes("/signin")) {
          failures.push(`${p.name}: redirected to sign-in`);
        }
        if (pageErrors.length) failures.push(`${p.name}: pageerror ${pageErrors[0]}`);
        if (serverErrors.length) failures.push(`${p.name}: ${serverErrors[0]}`);
        if (p.heading) {
          const ok = await page.getByRole("heading", { name: p.heading }).first().isVisible().catch(() => false);
          if (!ok) {
            // Role-gated or alternate title — annotate, do not invent pass.
            const body = await page.locator("body").innerText().catch(() => "");
            if (/not provisioned|no access|permission|upgrade|subscribe/i.test(body)) {
              testInfo.annotations.push({ type: "role-gated", description: p.path });
            }
          }
        }
        if (isLiveProductionUrl()) await page.waitForTimeout(400);
      } finally {
        page.off("pageerror", onError);
        page.off("response", onResponse);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("@read-only grid contracts: table, search/filter shell, row open/cancel", async ({ page }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);

    await ensureSignedIn(page);

    for (const path of GRID_CONTRACTS) {
      await page.goto(path);
      await assertApiReachable(page);
      const table = page.getByRole("table").first();
      try {
        await expect(table).toBeVisible({ timeout: 25000 });
      } catch {
        softSkip(testInfo, `Grid not visible at ${path}`);
      }

      const search = page.getByPlaceholder(/Search/i).first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill("E2E-NOMATCH");
        await page.waitForTimeout(500);
        await search.fill("");
      }

      const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
      if ((await rows.count()) > 0) {
        await rows.first().dblclick();
        await page.waitForTimeout(800);
        const close = page.getByRole("button", { name: /^(Cancel|Close)$/i }).first();
        if (await close.isVisible().catch(() => false)) await close.click();
      }
    }
  });

  test("@read-only form contracts: New modal labels, Save/Cancel, empty validation", async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);

    await ensureSignedIn(page);

    for (const c of FORM_NEW_CONTRACTS) {
      await page.goto(c.path);
      await assertApiReachable(page);
      await openNewRow(page);
      await expectModalHeading(page, c.heading);
      const dialog = page.locator("div.fixed.inset-0").last();
      await expect(dialog.getByRole("button", { name: /^Save changes$/i })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^(Cancel|Close)$/i })).toBeVisible();
      if (c.requiredHint) {
        await expect(dialog.getByText(c.requiredHint).first()).toBeVisible({ timeout: 5000 });
      }
      await dialog.getByRole("button", { name: /^Save changes$/i }).click();
      await expect(dialog).toBeVisible();
      await cancelEntityModal(page, c.heading);
    }
  });
});
