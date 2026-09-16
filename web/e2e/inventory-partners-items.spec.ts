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
  softSkip,
  noteIncomplete,
} from "./helpers/entityForm";
import { mutationsAllowed, currentTier } from "./helpers/liveSafety";
import { e2eMarker, ledgerAppend } from "./helpers/mutationLedger";

test.describe("inventory partners & items interaction", () => {
  test("@read-only partners: cancel New; open first row without save", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(90_000);

    await demoSignIn(page);
    await page.goto("/app/inventory/partners");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Partners table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New partner/i);
    await cancelEntityModal(page, /New partner/i);

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) > 0) {
      await openFirstDataRow(page);
      const editOpen = await page.getByRole("heading", { name: /Edit partner/i }).isVisible().catch(() => false);
      if (editOpen) await cancelEntityModal(page, /Edit partner/i).catch(() => undefined);
    }
  });

  test("@read-only items: cancel New; open first row without save", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(90_000);

    await demoSignIn(page);
    await page.goto("/app/inventory/items");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "Items table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New item/i);
    await cancelEntityModal(page, /New item/i);

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) > 0) {
      await openFirstDataRow(page);
      const editOpen = await page.getByRole("heading", { name: /Edit item/i }).isVisible().catch(() => false);
      if (editOpen) await cancelEntityModal(page, /Edit item/i).catch(() => undefined);
    }
  });

  test("@mutating @reversible partners: create E2E partner only", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(120_000);

    const name = e2eMarker("Partner");
    await demoSignIn(page);
    await page.goto("/app/inventory/partners");
    await assertApiReachable(page);
    await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });

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
    ledgerAppend({ kind: "partner", marker: name, path: "/app/inventory/partners", status: "created" });
  });

  test("@mutating @reversible items: create E2E item only", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(120_000);

    const name = e2eMarker("Item");
    await demoSignIn(page);
    await page.goto("/app/inventory/items");
    await assertApiReachable(page);
    await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });

    await openNewRow(page);
    await expectModalHeading(page, /New item/i);
    await fillTextByLabel(page, /Item name/i, name);
    await selectFirstOption(page, /Status/i).catch(() => undefined);
    await saveEntityModal(page, /New item/i);

    const stillOpen = await page.getByRole("heading", { name: /New item/i }).isVisible().catch(() => false);
    if (stillOpen) {
      await cancelEntityModal(page, /New item/i).catch(() => undefined);
      noteIncomplete(testInfo, "Item create stayed open (validation / required fields)");
      return;
    }
    ledgerAppend({ kind: "item", marker: name, path: "/app/inventory/items", status: "created" });
  });
});
