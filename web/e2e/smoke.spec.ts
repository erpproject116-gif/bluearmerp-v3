import { test, expect } from "@playwright/test";

test.describe("Bluearm ERP v3 smoke", () => {
  test("sign-in page loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /Sign in to Bluearm ERP/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try free demo/i })).toBeVisible();
  });

  test("demo sign-in reaches partners grid", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await page.goto("/signin");
    await page.getByRole("button", { name: /Try free demo/i }).click();
    await page.waitForURL("**/app/inventory/partners**", { timeout: 15000 });
    await expect(page.getByText(/F2 new/i)).toBeVisible();
  });

  test("demo sign-in reaches after-sales repair order list", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await page.goto("/signin");
    await page.getByRole("button", { name: /Try free demo/i }).click();
    await page.waitForURL("**/app/inventory/**", { timeout: 15000 });
    await page.getByRole("link", { name: "After-Sales" }).click();
    await page.waitForURL("**/after-sales/repair-orders**", { timeout: 10000 });
    await expect(page.getByRole("button", { name: /\+ New row/i })).toBeVisible();
  });

  test("demo repair order status search shows line rows", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await page.goto("/signin");
    await page.getByRole("button", { name: /Try free demo/i }).click();
    await page.waitForURL("**/app/inventory/**", { timeout: 15000 });
    await page.goto("/app/after-sales/repair-orders/status");
    await page.getByRole("button", { name: /Search \(F8\)/i }).click();
    await expect(page.getByRole("heading", { name: "Repair Order Status", level: 2 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("demo quotation list and status search", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await page.goto("/signin");
    await page.getByRole("button", { name: /Try free demo/i }).click();
    await page.waitForURL("**/app/inventory/**", { timeout: 15000 });
    await page.getByRole("link", { name: "Quotation" }).click();
    await page.waitForURL("**/app/quotation/**", { timeout: 10000 });
    await expect(page.getByRole("button", { name: /\+ New row/i })).toBeVisible();
    await page.goto("/app/quotation/quotations/status");
    await page.getByRole("button", { name: /Search \(F8\)/i }).click();
    await expect(page.getByRole("heading", { name: "Quotation Status", level: 2 })).toBeVisible({ timeout: 10000 });
  });

  test("demo tax types list", async ({ page }) => {
    test.skip(!process.env.E2E_DEMO_PASSWORD, "Set E2E_DEMO_PASSWORD for authenticated smoke");

    await page.goto("/signin");
    await page.getByRole("button", { name: /Try free demo/i }).click();
    await page.waitForURL("**/app/**", { timeout: 15000 });
    await page.goto("/app/quotation/tax-mngt/tax-types");
    await expect(page.getByRole("button", { name: /\+ New row/i })).toBeVisible({ timeout: 10000 });
  });
});
