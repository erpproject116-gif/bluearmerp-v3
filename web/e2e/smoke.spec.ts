import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";

test.describe("Bluearm ERP v3 smoke", () => {
  test("@smoke @read-only sign-in page loads", async ({ page }) => {
    await page.goto("/signin");
    // Already-authenticated storageState (live Google session) may redirect into the app.
    const signInHeading = page.getByRole("heading", { name: /^Sign in$/i });
    const googleBtn = page.getByRole("button", { name: /Sign up or continue with Google/i });
    const appShell = page
      .getByRole("navigation")
      .or(page.getByRole("button", { name: /Collapse sidebar|Search/i }))
      .or(page.locator("aside, nav"))
      .first();
    await expect(signInHeading.or(googleBtn).or(appShell).first()).toBeVisible({ timeout: 15000 });
    if (await signInHeading.isVisible().catch(() => false)) {
      await expect(googleBtn).toBeVisible();
      const demo = page.getByRole("button", { name: /Try free demo/i });
      if (await demo.count()) {
        await expect(demo).toBeVisible();
      }
    }
  });

  test("@smoke @read-only demo sign-in reaches partners grid", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/inventory/partners");
    await assertApiReachable(page);
    await expect(
      page
        .getByRole("heading", { name: /Partners|Customers\s*&\s*vendors|Customers/i })
        .or(page.getByRole("button", { name: /\+?\s*New/i }))
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("@smoke @read-only demo sign-in reaches after-sales repair order list", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/after-sales/repair-orders");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Repair/i })).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("@smoke @read-only demo repair order status page loads", async ({ page }) => {
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

  test("@smoke @read-only demo quotation list loads", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/quotation/quotations");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Quotation/i })).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("@smoke @read-only demo tax types list", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD in .env.local)");

    await demoSignIn(page);
    await page.goto("/app/quotation/tax-mngt/tax-types");
    await assertApiReachable(page);
    await expect(
      page.getByRole("button", { name: /New/i }).or(page.getByRole("heading", { name: /Tax/i })).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
