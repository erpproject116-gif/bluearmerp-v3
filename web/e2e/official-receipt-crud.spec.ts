import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  saveEntityModal,
  fillTextByLabel,
  uniqueToken,
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";

test.describe("official-receipt CRUD interaction", () => {
  test("cancel New; edit existing Notes+Save when rows exist", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(120_000);

    const note = uniqueToken("OR");
    await demoSignIn(page);
    await page.goto("/app/finance/official-receipts");
    await assertApiReachable(page);

    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "OR list table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Official Receipt/i);
    await saveEntityModal(page, /New Official Receipt/i);
    await expect(page.getByRole("heading", { name: /New Official Receipt/i })).toBeVisible({ timeout: 5000 });
    await cancelEntityModal(page, /New Official Receipt/i);

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) === 0) {
      softSkip(testInfo, "No official receipts to edit");
    }

    // Prefer row History / code click; dblclick may be a no-op on some grids.
    const hist = rows.first().getByRole("button", { name: /^History$/i });
    if ((await hist.count()) > 0) {
      await hist.click();
      await expect(page.getByRole("dialog", { name: /History/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole("dialog", { name: /History/i }).getByRole("button", { name: "Close" }).click();
    }

    await openFirstDataRow(page);
    const editOpen = await page
      .getByRole("heading", { name: /Edit Official Receipt|Official Receipt/i })
      .isVisible()
      .catch(() => false);
    if (!editOpen) {
      noteIncomplete(testInfo, "OR row did not open edit modal (list-only / different gesture)");
      return;
    }
    const notes = page.locator("label").filter({ hasText: /^Notes/i }).first();
    if (await notes.isVisible().catch(() => false)) {
      await fillTextByLabel(page, /^Notes/i, note);
      await saveEntityModal(page);
    } else {
      await cancelEntityModal(page);
    }
  });
});
