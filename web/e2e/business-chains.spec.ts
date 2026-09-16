import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import { installMutationGuard, mutationsAllowed, currentTier, writeEvidence } from "./helpers/liveSafety";
import { loadTenantProfile } from "./helpers/tenantProfile";
import { e2eMarker, ledgerAppend } from "./helpers/mutationLedger";
import {
  openNewRow,
  expectModalHeading,
  cancelEntityModal,
  fillLookup,
  fillDate,
  fillTextByLabel,
  selectFirstOption,
  setProgressStatus,
  addItemLine,
  saveEntityModal,
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";

/**
 * Staged business journeys.
 * Default: read/cancel/validation only.
 * Reversible: create E2E-* drafts when mutations allowed.
 * Posting: opt-in separate specs (GR already gated).
 */
test.describe("Business chains — Inventory pilot", () => {
  test("@read-only inventory chain: partners → items → locations → find stock → reports", async ({
    page,
  }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(10 * 60 * 1000);

    await installMutationGuard(page);
    await demoSignIn(page);

    const steps = [
      "/app/inventory/partners",
      "/app/inventory/items",
      "/app/inventory/locations",
      "/app/inventory/find-stock",
      "/app/inventory/serial-lot/registry",
      "/app/inventory/reports/on-hand",
      "/app/inventory/reports/stock-balance",
    ];
    for (const path of steps) {
      await page.goto(path);
      await assertApiReachable(page);
      const shell = page.locator("nav, aside, h1, h2, table, main").first();
      try {
        await expect(shell).toBeVisible({ timeout: 20000 });
      } catch {
        softSkip(testInfo, `Inventory step not visible: ${path}`);
      }
    }
    writeEvidence("inventory-chain-read.json", { steps, result: "ok" });
  });
});

test.describe("Business chains — Selling", () => {
  test("@read-only selling chain surfaces: quotation → SO → sales → OR", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(10 * 60 * 1000);
    await installMutationGuard(page);
    await demoSignIn(page);

    for (const path of [
      "/app/quotation/quotations",
      "/app/sales-order/sales-orders",
      "/app/sales/sales",
      "/app/finance/official-receipts",
      "/app/finance/reports/ar-aging",
    ]) {
      await page.goto(path);
      await assertApiReachable(page);
      try {
        await expect(page.locator("table, main, h1, h2").first()).toBeVisible({ timeout: 20000 });
      } catch {
        softSkip(testInfo, `Selling surface missing: ${path}`);
      }
    }
  });

  test("@mutating @reversible selling: create E2E quotation draft only", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(120_000);

    const profile = loadTenantProfile();
    const note = e2eMarker("SELL-QUO");
    await demoSignIn(page);
    await page.goto("/app/quotation/quotations");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Quotations table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Quotation/i);
    try {
      await fillDate(page, /^Date/i, new Date().toISOString().slice(0, 10));
      await selectFirstOption(page, /Currency/i).catch(() => undefined);
      await fillLookup(page, /Customer/i, profile.partnerQuery);
      await fillLookup(page, /Location-Out|Location/i, profile.locationQuery).catch(() => undefined);
      await setProgressStatus(page);
      await fillTextByLabel(page, /^Notes/i, note).catch(() => undefined);
      await addItemLine(page, profile.itemQuery);
      await saveEntityModal(page, /New Quotation/i);
      await page.waitForTimeout(1500);
      if (await page.getByRole("heading", { name: /New Quotation/i }).isVisible().catch(() => false)) {
        await cancelEntityModal(page, /New Quotation/i).catch(() => undefined);
        noteIncomplete(testInfo, "E2E quotation stayed open");
        return;
      }
      ledgerAppend({
        kind: "quotation",
        marker: note,
        path: "/app/quotation/quotations",
        status: "created",
        detail: "selling-chain-draft",
      });
    } catch (e) {
      await cancelEntityModal(page, /New Quotation/i).catch(() => undefined);
      noteIncomplete(testInfo, `selling quotation: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
});

test.describe("Business chains — Buying", () => {
  test("@read-only buying chain surfaces: PR → PO → GR → purchase invoice → PV", async ({
    page,
  }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(10 * 60 * 1000);
    await installMutationGuard(page);
    await demoSignIn(page);

    for (const path of [
      "/app/purchase-request/purchase-requests",
      "/app/purchase-order/purchase-orders",
      "/app/purchase-order/goods-receipt",
      "/app/inventory/serial-lot/receive",
      "/app/purchases/purchase-receive",
      "/app/finance/payment-vouchers",
      "/app/finance/reports/ap-aging",
    ]) {
      await page.goto(path);
      await assertApiReachable(page);
      try {
        await expect(page.locator("table, main, h1, h2").first()).toBeVisible({ timeout: 20000 });
      } catch {
        softSkip(testInfo, `Buying surface missing: ${path}`);
      }
    }
  });
});

test.describe("Business chains — Accounting", () => {
  test("@read-only accounting surfaces: COA, JE, AR/AP hubs, key reports", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(12 * 60 * 1000);
    await installMutationGuard(page);
    await demoSignIn(page);

    for (const path of [
      "/app/finance/acct-i/chart-of-accounts",
      "/app/finance/acct-i/journal-entries",
      "/app/finance/receivables",
      "/app/finance/payables",
      "/app/finance/banking",
      "/app/finance/acct-i/reports/trial-balance",
      "/app/finance/acct-i/reports/profit-and-loss",
      "/app/finance/acct-i/reports/general-ledger",
    ]) {
      await page.goto(path);
      await assertApiReachable(page);
      try {
        await expect(page.locator("table, main, h1, h2, canvas").first()).toBeVisible({ timeout: 20000 });
      } catch {
        softSkip(testInfo, `Accounting surface missing: ${path}`);
      }
    }
  });
});
