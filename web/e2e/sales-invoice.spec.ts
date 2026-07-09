import { test, expect } from "@playwright/test";

async function demoSignIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: /Try free demo/i }).click();
  await page.waitForURL("**/app/**", { timeout: 15000 });
}

test.describe("Sales invoice tab", () => {
  test("demo sale invoice tab shows item breakdown", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await demoSignIn(page);
    await page.goto("/app/sales/sales");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.dblclick();

    await expect(page.getByRole("heading", { name: /Edit Sale \(actual sale\)/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Invoice" }).click();

    await expect(page.getByRole("heading", { name: "Item breakdown", level: 3 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("columnheader", { name: "Item code" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Line total" })).toBeVisible();
  });
});
