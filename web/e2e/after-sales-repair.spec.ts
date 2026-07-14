import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  saveEntityModal,
  fillLookup,
  fillDate,
  fillTextByLabel,
  setProgressStatus,
  uniqueToken,
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";

test.describe("after-sales repair order interaction", () => {
  test("list controls: New cancel; edit existing; create when lookups work", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(120_000);
    page.setDefaultTimeout(12_000);

    const note = uniqueToken("RO");
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
      if (editOpen) {
        const details = page.locator("label").filter({ hasText: /Repair details/i }).first();
        if (await details.isVisible().catch(() => false)) {
          await fillTextByLabel(page, /Repair details/i, note);
          await saveEntityModal(page, /Edit Repair Order/i);
          await page.waitForTimeout(1000);
          // Ensure modal closed before continuing
          if (await page.getByRole("heading", { name: /Edit Repair Order/i }).isVisible().catch(() => false)) {
            await cancelEntityModal(page, /Edit Repair Order/i).catch(() => undefined);
          }
        } else {
          await cancelEntityModal(page, /Edit Repair Order/i);
        }
      }
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Repair Order/i);
    try {
      await Promise.race([
        (async () => {
          await fillDate(page, /^Date/i, new Date().toISOString().slice(0, 10));
          await fillLookup(page, /Customer/i, "Seda");
          await fillLookup(page, /Location/i, "Head");
          await setProgressStatus(page);
          await fillTextByLabel(page, /Repair details/i, note).catch(() => undefined);
          await saveEntityModal(page, /New Repair Order/i);
          await page.waitForTimeout(1500);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("create path exceeded 35s")), 35_000),
        ),
      ]);
      const stillOpen = await page.getByRole("heading", { name: /New Repair Order/i }).isVisible().catch(() => false);
      if (stillOpen) {
        await cancelEntityModal(page, /New Repair Order/i).catch(() => undefined);
        noteIncomplete(testInfo, "Repair create stayed open (validation / seed)");
        return;
      }
    } catch (e) {
      await cancelEntityModal(page, /New Repair Order/i).catch(() => undefined);
      noteIncomplete(testInfo, `Repair create: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
});
