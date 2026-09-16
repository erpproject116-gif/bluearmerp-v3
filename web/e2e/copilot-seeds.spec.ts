import { test, expect, type Page } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { softSkip } from "./helpers/entityForm";

/** Wait until some input/textarea on the page carries the given value. */
async function expectInputWithValue(page: Page, value: string, timeout = 15_000) {
  await page.waitForFunction(
    (needle) =>
      Array.from(document.querySelectorAll("input, textarea")).some((el) =>
        (el as HTMLInputElement).value.includes(needle),
      ),
    value,
    { timeout },
  );
}

/**
 * Copilot approve-to-seed handoffs: a sanitized seed staged in sessionStorage
 * must prefill the target screen. Nothing is saved — these specs assert
 * staging/prefill only and never click Save/Import.
 */
test.describe("Copilot seed handoffs", () => {
  test("sales order doc seed prefills the create modal @read-only", async ({ page }) => {
    test.setTimeout(90_000);

    await ensureSignedIn(page);
    await assertApiReachable(page);

    await page.evaluate(() => {
      sessionStorage.setItem(
        "bluearm.docSeed.sales_order",
        JSON.stringify({
          partner_name: "Copilot Seed Customer",
          needs_qty_review: true,
          lines: [{ item_code: "SEED-01", item_name: "Copilot Seeded Item", qty: 1 }],
        }),
      );
    });
    await page.goto("/app/sales-order/sales-orders/new");

    await expect(page.getByRole("heading", { name: /New Sales Order/i })).toBeVisible({ timeout: 25_000 });
    // Seeded line lands in the grid; seeded partner label lands in the customer lookup.
    await expectInputWithValue(page, "Copilot Seeded Item");
    await expectInputWithValue(page, "Copilot Seed Customer");
    // Seed is one-shot.
    const remaining = await page.evaluate(() => sessionStorage.getItem("bluearm.docSeed.sales_order"));
    expect(remaining).toBeNull();
  });

  test("@read-only migration import seed opens the mapped-import modal prefilled", async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    await ensureSignedIn(page);
    await assertApiReachable(page);

    await page.evaluate(() => {
      sessionStorage.setItem(
        "bluearm.migImportSeed",
        JSON.stringify({
          kind: "items",
          file_name: "copilot-items.csv",
          csv_text: "Item Name,Unit,Sales Price\nSeed Pen,pcs,10\n",
          column_map: { item_name: "Item Name", unit: "Unit", sales_price: "Sales Price" },
        }),
      );
    });
    await page.goto("/app/user-management/migration-center");

    // Demo workspaces may not grant migration.center to the demo role.
    const denied = page.getByText(/You do not have access to this area/i);
    const modalHeading = page.getByRole("heading", { name: /Import Products \/ items/i });
    await expect(denied.or(modalHeading).first()).toBeVisible({ timeout: 25_000 });
    if (await denied.isVisible()) {
      softSkip(testInfo, "Demo user lacks Migration Center access");
      return;
    }

    // Modal auto-opens for the seeded kind with the Copilot note and mapped headers.
    await expect(modalHeading).toBeVisible();
    await expect(page.getByText(/Prefilled from your Baiko attachment/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("select").filter({ hasText: "Item Name" }).first()).toBeVisible();
    const remaining = await page.evaluate(() => sessionStorage.getItem("bluearm.migImportSeed"));
    expect(remaining).toBeNull();
    // Close without importing — nothing was posted.
    await page.getByRole("button", { name: /^Cancel$/i }).click();
  });

  test("@read-only serial/lot seed stages the paste buffer on the receive page", async ({ page }) => {
    test.setTimeout(90_000);

    await ensureSignedIn(page);
    await assertApiReachable(page);

    await page.evaluate(() => {
      sessionStorage.setItem(
        "bluearm.serialLotSeed",
        JSON.stringify({
          file_name: "serials.csv",
          rows: [{ serial: "SN-COPILOT-1" }, { serial: "SN-COPILOT-2" }],
          serial_count: 2,
          lot_count: 0,
        }),
      );
    });
    await page.goto("/app/inventory/serial-lot/receive");

    // Staged toast confirms the propose-only handoff; seed is consumed.
    await expect(page.getByText(/Baiko staged 2 serial\(s\)/i)).toBeVisible({ timeout: 25_000 });
    const remaining = await page.evaluate(() => sessionStorage.getItem("bluearm.serialLotSeed"));
    expect(remaining).toBeNull();
  });
});
