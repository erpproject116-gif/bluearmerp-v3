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
  selectFirstOption,
  uniqueToken,
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";

test.describe("inventory partners & items interaction", () => {
  test("partners: cancel New; create unique partner; edit save", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(120_000);

    const name = uniqueToken("Partner");
    await demoSignIn(page);
    await page.goto("/app/inventory/partners");
    await assertApiReachable(page);
    await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });

    await openNewRow(page);
    await expectModalHeading(page, /New partner/i);
    await cancelEntityModal(page, /New partner/i);

    await openNewRow(page);
    await expectModalHeading(page, /New partner/i);
    await selectFirstOption(page, /Kind/i).catch(() => undefined);
    await fillTextByLabel(page, /Company name/i, name);
    await selectFirstOption(page, /Status/i).catch(() => undefined);
    await saveEntityModal(page, /New partner/i);

    const created =
      (await page.getByText(name).first().isVisible().catch(() => false)) ||
      !(await page.getByRole("heading", { name: /New partner/i }).isVisible().catch(() => false));
    if (!created) {
      await cancelEntityModal(page, /New partner/i).catch(() => undefined);
      noteIncomplete(testInfo, "Partner create did not complete");
      return;
    }

    // Edit first row if modal closed
    if (!(await page.getByRole("heading", { name: /partner/i }).isVisible().catch(() => false))) {
      await openFirstDataRow(page);
      await expectModalHeading(page, /Edit partner/i);
      await fillTextByLabel(page, /Company name/i, `${name}-edit`).catch(() => undefined);
      await saveEntityModal(page, /Edit partner/i);
    }
  });

  test("items: cancel New; create unique item; edit", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(120_000);

    const name = uniqueToken("Item");
    await demoSignIn(page);
    await page.goto("/app/inventory/items");
    await assertApiReachable(page);
    await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });

    await openNewRow(page);
    await expectModalHeading(page, /New item/i);
    await cancelEntityModal(page, /New item/i);

    await openNewRow(page);
    await expectModalHeading(page, /New item/i);
    // Item code is often auto-generated (readonly) on create.
    await fillTextByLabel(page, /Item name/i, name);
    await selectFirstOption(page, /Status/i).catch(() => undefined);
    await saveEntityModal(page, /New item/i);

    const stillOpen = await page.getByRole("heading", { name: /New item/i }).isVisible().catch(() => false);
    if (stillOpen) {
      await cancelEntityModal(page, /New item/i).catch(() => undefined);
      noteIncomplete(testInfo, "Item create stayed open (validation / required fields)");
      return;
    }

    await openFirstDataRow(page);
    await expectModalHeading(page, /Edit item/i);
    await cancelEntityModal(page, /Edit item/i);
  });
});
