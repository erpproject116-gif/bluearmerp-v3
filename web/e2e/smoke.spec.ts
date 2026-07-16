import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";

test.describe("Bluearm ERP v3 smoke", () => {
  test("sign-in page loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /^Sign in$/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Sign up or continue with Google/i })).toBeVisible();
    const demo = page.getByRole("button", { name: /Try free demo/i });
    if (await demo.count()) {
      await expect(demo).toBeVisible();
    }
  });

  test("demo sign-in reaches partners grid", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/inventory/partners");
    await assertApiReachable(page);
    await expect(
      page.getByRole("heading", { name: /Partners/i }).or(page.getByRole("button", { name: /New/i })).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("demo sign-in reaches after-sales repair order list", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/after-sales/repair-orders");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Repair/i })).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("demo repair order status page loads", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/after-sales/repair-orders/status");
    await assertApiReachable(page);
    await expect(
      page
        .getByRole("heading", { name: /Repair Order Status|Repair/i })
        .or(page.getByRole("button", { name: /Search/i }))
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("demo quotation list loads", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/quotation/quotations");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Quotation/i })).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("demo tax types list", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/quotation/tax-mngt/tax-types");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Tax/i })).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
