import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";

/**
 * Deep journey — needs a confirmed open PO (DEMOGR902 preferred, DEMOGR903 fallback).
 * Re-open seed: `psql "$DATABASE_URL" -f scripts/reset-demo-po-gr-open.sql`
 * or re-run `scripts/seed-demo-po-gr-open.sql` (now reopens fully-received DEMOGR902).
 */
const CANDIDATES = [
  { po: "DEMOGR902", serials: 5 },
  { po: "DEMOGR903", serials: 3 },
] as const;

test.describe("Goods receipt receive", () => {
  test("create draft GR from open demo PO, paste serials, and post", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");
    test.setTimeout(120_000);

    const serialPrefix = `E2E-GR-${Date.now()}`;

    await demoSignIn(page);
    await page.goto("/app/inventory/serial-lot/receive");
    await assertApiReachable(page);
    await expect(page.getByRole("heading", { name: /Receive \/ Scan Serials/i })).toBeVisible({ timeout: 15000 });

    let used: (typeof CANDIDATES)[number] | null = null;
    for (const c of CANDIDATES) {
      const poInput = page.getByLabel(/Purchase order/i);
      await poInput.click();
      await poInput.fill("");
      await poInput.fill(c.po);
      const poOption = page.getByRole("button", { name: new RegExp(c.po) }).first();
      if (!(await poOption.isVisible().catch(() => false))) continue;
      await poOption.click();
      await expect(page.getByText(/Location:/i)).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "Create goods receipt" }).click();
      const grLabel = page.getByText(/Goods receipt:/i);
      try {
        await expect(grLabel).toBeVisible({ timeout: 15000 });
        used = c;
        break;
      } catch {
        const clear = page.getByRole("button", { name: /Clear|Reset/i }).first();
        if (await clear.isVisible().catch(() => false)) await clear.click();
      }
    }

    if (!used) {
      test.skip(true, "No open demo PO (run scripts/reset-demo-po-gr-open.sql or seed-demo-po-gr-open.sql)");
    }

    const serials = Array.from({ length: used!.serials }, (_, i) => `${serialPrefix}-${String(i + 1).padStart(2, "0")}`);
    await expect(page.getByText(new RegExp(`PO:.*${used!.po}`))).toBeVisible();

    await page.getByRole("button", { name: "Paste serials" }).click();
    await page.getByPlaceholder(/SN001/i).fill(serials.join("\n"));
    await page.getByRole("button", { name: "Import pasted serials" }).click();

    const postBtn = page.getByRole("button", { name: "Post goods receipt" });
    await expect(postBtn).toBeEnabled({ timeout: 30000 });
    await postBtn.click();

    await expect(page.getByText(/Goods receipt posted/i)).toBeVisible({ timeout: 15000 });

    await page.goto("/app/purchases/purchase-receive?view=history&from=goods-receipt");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder(/Search PO no|Search/i).fill(used!.po);
    await expect(page.getByRole("cell", { name: used!.po })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Posted").first()).toBeVisible({ timeout: 10000 });
  });
});
