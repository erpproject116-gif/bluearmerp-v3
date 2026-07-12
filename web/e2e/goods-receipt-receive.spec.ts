import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";

const DEMO_PO = "DEMOGR902";
const EXPECTED_SERIALS = 5;

test.describe("Goods receipt receive", () => {
  test("create draft GR from DEMOGR902, paste serials, and post", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");

    const serialPrefix = `E2E-GR-${Date.now()}`;
    const serials = Array.from({ length: EXPECTED_SERIALS }, (_, i) => `${serialPrefix}-${String(i + 1).padStart(2, "0")}`);

    await demoSignIn(page);
    await page.goto("/app/inventory/serial-lot/receive");
    await expect(page.getByRole("heading", { name: /Receive \/ Scan Serials/i })).toBeVisible({ timeout: 15000 });

    const poInput = page.getByLabel(/Purchase order/i);
    await poInput.click();
    await poInput.fill(DEMO_PO);
    await page.getByRole("button", { name: new RegExp(DEMO_PO) }).first().click();

    await expect(page.getByText(/Location:/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Create goods receipt" }).click();

    await expect(page.getByText(/Goods receipt:/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(new RegExp(`PO:.*${DEMO_PO}`))).toBeVisible();

    await page.getByRole("button", { name: "Paste serials" }).click();
    await page.getByPlaceholder(/SN001/i).fill(serials.join("\n"));
    await page.getByRole("button", { name: "Import pasted serials" }).click();

    const postBtn = page.getByRole("button", { name: "Post goods receipt" });
    await expect(postBtn).toBeEnabled({ timeout: 30000 });
    await postBtn.click();

    await expect(page.getByText(/Goods receipt posted/i)).toBeVisible({ timeout: 15000 });

    await page.goto("/app/purchase-order/goods-receipt");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder(/Search PO no/i).fill(DEMO_PO);
    await expect(page.getByRole("cell", { name: DEMO_PO })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Posted").first()).toBeVisible({ timeout: 10000 });
  });
});
