import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";

test.describe("Sales invoice tab", () => {
  test("@smoke @read-only sale invoice tab shows item breakdown", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");

    await demoSignIn(page);
    await page.goto("/app/sales/sales");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.dblclick();

    await expect(page.getByRole("heading", { name: /Edit Sale \(actual sale\)/i })).toBeVisible({ timeout: 10000 });
    // exact: avoid matching "Create collective invoice (0)"
    await page.getByRole("button", { name: "Invoice", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Item breakdown", level: 3 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("columnheader", { name: "Item code" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Line total" })).toBeVisible();
  });
});
