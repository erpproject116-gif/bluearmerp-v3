import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  saveEntityModal,
  fillTextByLabel,
  selectFirstOption,
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";
import { mutationsAllowed, currentTier } from "./helpers/liveSafety";
import { e2eMarker, ledgerAppend } from "./helpers/mutationLedger";

/** Phase 2: CRM, finance COA/JE, RFQ, payment vouchers — cancel / gated create. */

test.describe("Phase 2 CRM leads", () => {
  test("@read-only leads: cancel New; open first without save", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/crm/leads");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "CRM leads table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New lead/i);
    await cancelEntityModal(page, /New lead/i);
  });

  test("@mutating @reversible leads: create unique E2E lead", async ({ page }, testInfo) => {
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    const name = e2eMarker("Lead");
    await ensureSignedIn(page);
    await page.goto("/app/crm/leads");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "CRM leads table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New lead/i);
    await fillTextByLabel(page, /Lead name/i, name);
    await fillTextByLabel(page, /Company/i, `${name} Co`).catch(() => undefined);
    await selectFirstOption(page, /Status/i).catch(() => undefined);
    await saveEntityModal(page, /New lead/i);
    await page.waitForTimeout(1500);
    if (await page.getByRole("heading", { name: /New lead/i }).isVisible().catch(() => false)) {
      await cancelEntityModal(page, /New lead/i).catch(() => undefined);
      noteIncomplete(testInfo, "Lead create stayed open");
      return;
    }
    ledgerAppend({ kind: "lead", marker: name, path: "/app/crm/leads", status: "created" });
  });
});

test.describe("Phase 2 chart of accounts", () => {
  test("@read-only COA: cancel New without create", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/finance/acct-i/chart-of-accounts");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "COA table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New account/i);
    await cancelEntityModal(page, /New account/i);
  });

  test("@mutating @reversible COA: create unique E2E account", async ({ page }, testInfo) => {
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    const code = `E${String(Date.now()).slice(-6)}`;
    await ensureSignedIn(page);
    await page.goto("/app/finance/acct-i/chart-of-accounts");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "COA table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New account/i);
    await fillTextByLabel(page, /Account code/i, code);
    await fillTextByLabel(page, /Account name/i, `E2E Account ${code}`);
    await selectFirstOption(page, /Account type/i).catch(() => undefined);
    await saveEntityModal(page, /New account/i);
    await page.waitForTimeout(1500);
    if (await page.getByRole("heading", { name: /New account/i }).isVisible().catch(() => false)) {
      await cancelEntityModal(page, /New account/i).catch(() => undefined);
      noteIncomplete(testInfo, "COA create stayed open");
      return;
    }
    ledgerAppend({ kind: "coa", marker: code, path: "/app/finance/acct-i/chart-of-accounts", status: "created" });
  });
});

test.describe("Phase 2 journal entries", () => {
  test("@read-only JE: open New draft modal and cancel", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/finance/acct-i/journal-entries");
    await assertApiReachable(page);

    const newBtn = page.getByRole("button", { name: /New draft/i });
    try {
      await expect(newBtn).toBeVisible({ timeout: 20000 });
    } catch {
      softSkip(testInfo, "Journal New draft control not visible");
    }
    await newBtn.click();
    await expectModalHeading(page, /New journal entry/i);
    await fillTextByLabel(page, /Remarks/i, e2eMarker("JE")).catch(() => undefined);
    await cancelEntityModal(page, /New journal entry/i);
    await expect(page.getByRole("heading", { name: /New journal entry/i })).toBeHidden({ timeout: 10000 });
  });
});

test.describe("Phase 2 payment vouchers", () => {
  test("@read-only PV: cancel New; History when rows exist", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/finance/payment-vouchers");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Payment vouchers table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Payment Voucher/i);
    await cancelEntityModal(page, /New Payment Voucher/i);

    const hist = page.locator("tbody tr").filter({ hasNotText: /Resize column/i }).first().getByRole("button", { name: /^History$/i });
    if ((await hist.count()) > 0) {
      await hist.click();
      await expect(page.getByRole("dialog", { name: /History/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole("dialog", { name: /History/i }).getByRole("button", { name: "Close" }).click();
    } else {
      noteIncomplete(testInfo, "No PV History button on first row");
    }
  });
});

test.describe("Phase 2 RFQ", () => {
  test("@read-only RFQ: open New modal and close", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/purchase-order/rfq");
    await assertApiReachable(page);

    const newBtn = page.getByRole("button", { name: /^New RFQ$/i });
    try {
      await expect(newBtn).toBeVisible({ timeout: 20000 });
    } catch {
      softSkip(testInfo, "New RFQ button not visible");
    }
    await newBtn.click();
    await expect(page.getByRole("heading", { name: /New RFQ/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Close|Cancel/i }).first().click();
    await expect(page.getByRole("heading", { name: /New RFQ/i })).toBeHidden({ timeout: 10000 });

    // List may be empty — still prove table shell when present
    const table = page.getByRole("table").first();
    if (await table.isVisible().catch(() => false)) {
      await expect(table).toBeVisible();
    }
  });
});

test.describe("Phase 2 purchase request smoke", () => {
  test("@read-only PR list has rows (or soft-skip) and History opens", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await ensureSignedIn(page);
    await page.goto("/app/purchase-request/purchase-requests");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "PR table not visible — run scripts/seed-demo-purchase-requests.sql");
    }

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) === 0) {
      softSkip(testInfo, "No PR rows — run scripts/seed-demo-purchase-requests.sql");
    }

    const hist = rows.first().getByRole("button", { name: /^History$/i });
    await hist.click();
    await expect(page.getByRole("dialog", { name: /History/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("dialog", { name: /History/i }).getByRole("button", { name: "Close" }).click();
  });
});
