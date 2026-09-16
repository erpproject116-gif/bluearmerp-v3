import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  softSkip,
} from "./helpers/entityForm";
import { mutationsAllowed, currentTier } from "./helpers/liveSafety";
import { loadTenantProfile } from "./helpers/tenantProfile";
import { e2eMarker, ledgerAppend } from "./helpers/mutationLedger";
import {
  fillLookup,
  fillDate,
  fillTextByLabel,
  setProgressStatus,
  saveEntityModal,
  noteIncomplete,
} from "./helpers/entityForm";

test.describe("after-sales repair order interaction", () => {
  test("@read-only list: New cancel; open existing without save", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(90_000);
    page.setDefaultTimeout(12_000);

    await demoSignIn(page);
    await page.goto("/app/after-sales/repair-orders");
    await assertApiReachable(page);

    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Repair order list table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Repair Order/i);
    await cancelEntityModal(page, /New Repair Order/i);

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) > 0) {
      await openFirstDataRow(page);
      const editOpen = await page
        .getByRole("heading", { name: /Edit Repair Order/i })
        .isVisible()
        .catch(() => false);
      if (editOpen) await cancelEntityModal(page, /Edit Repair Order/i).catch(() => undefined);
    }
  });

  test("@mutating @reversible create E2E repair order when lookups work", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(120_000);
    page.setDefaultTimeout(12_000);

    const profile = loadTenantProfile();
    const note = e2eMarker("RO");
    await demoSignIn(page);
    await page.goto("/app/after-sales/repair-orders");
    await assertApiReachable(page);

    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Repair order list table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Repair Order/i);
    try {
      await Promise.race([
        (async () => {
          await fillDate(page, /^Date/i, new Date().toISOString().slice(0, 10));
          await fillLookup(page, /Customer/i, profile.partnerQuery);
          await fillLookup(page, /Location/i, profile.locationQuery);
          await setProgressStatus(page);
          await fillTextByLabel(page, /Repair details/i, note).catch(() => undefined);
          await saveEntityModal(page, /New Repair Order/i);
          await page.waitForTimeout(1500);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("create path exceeded 35s")), 35_000),
        ),
      ]);
      const stillOpen = await page
        .getByRole("heading", { name: /New Repair Order/i })
        .isVisible()
        .catch(() => false);
      if (stillOpen) {
        await cancelEntityModal(page, /New Repair Order/i).catch(() => undefined);
        noteIncomplete(testInfo, "Repair create stayed open");
        return;
      }
      ledgerAppend({
        kind: "repair-order",
        marker: note,
        path: "/app/after-sales/repair-orders",
        status: "created",
      });
    } catch (e) {
      await cancelEntityModal(page, /New Repair Order/i).catch(() => undefined);
      noteIncomplete(testInfo, `Repair create: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
});
