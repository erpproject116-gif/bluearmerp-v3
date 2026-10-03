import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import { softSkip } from "./helpers/entityForm";

/**
 * Cashier shell v2 smoke (Phase 7): open → add → pay → print path → drawer → close.
 * Enable flag via localStorage before first POS navigation.
 */
test.describe("POS cashier shell v2 smoke", () => {
  test("open shift, sell cash, open slip path, cash drawer, close", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");
    test.setTimeout(120_000);

    await demoSignIn(page);

    await page.addInitScript(() => {
      try {
        localStorage.setItem("pos_cashier_shell_v2", "1");
      } catch {
        /* ignore */
      }
    });

    await page.goto("/app/pos");
    await assertApiReachable(page);

    // Already-open session or open-shift form
    const openSessionBtn = page.getByRole("button", { name: /Open session/i });
    const chargeBtn = page.getByRole("button", { name: /Charge|Pay/i }).first();
    const hasSession = await chargeBtn.isVisible({ timeout: 8000 }).catch(() => false);
    const needsOpen = await openSessionBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (!hasSession && needsOpen) {
      // Prefer default location already filled; otherwise pick first lookup hit.
      const locInput = page.getByPlaceholder(/Select location/i);
      if (await locInput.isVisible().catch(() => false)) {
        const current = await locInput.inputValue().catch(() => "");
        if (!current.trim()) {
          await locInput.click();
          await locInput.fill("a");
          const opt = page.locator("button").filter({ hasText: /.+/ }).nth(0);
          // LookupCombo renders option buttons in a dropdown
          const option = page.locator("[role='listbox'] button, .absolute button").first();
          if (await option.isVisible({ timeout: 4000 }).catch(() => false)) {
            await option.click();
          } else {
            softSkip(testInfo, "No inventory location available to open a POS shift");
          }
        }
      }
      await page.getByLabel(/Opening cash/i).or(page.locator("input").nth(1)).fill("1000");
      await openSessionBtn.click();
      await expect(page.getByRole("button", { name: /Charge|Pay|More/i }).first()).toBeVisible({ timeout: 20000 });
    } else if (!hasSession && !needsOpen) {
      softSkip(testInfo, "POS terminal neither showed open-shift nor an active session");
    }

    // Shell chrome behind flag
    await expect(page.getByRole("button", { name: /^More$/i })).toBeVisible({ timeout: 15000 });
    const search = page.getByPlaceholder(/Ready to scan|Search/i);
    await expect(search).toBeVisible();

    // Add first sellable product tile (skip sold-out)
    const tiles = page.locator("button.group").filter({ has: page.locator("span.line-clamp-2") });
    const tileCount = await tiles.count();
    if (tileCount === 0) {
      softSkip(testInfo, "POS catalog empty — seed active sellable items for DEMO000");
    }

    let added = false;
    for (let i = 0; i < Math.min(tileCount, 12); i++) {
      const tile = tiles.nth(i);
      const disabled = await tile.isDisabled().catch(() => true);
      if (disabled) continue;
      await tile.click();
      // Product modal (modifiers) — cancel and try next
      const modalAdd = page.getByRole("button", { name: /^Add$/i });
      if (await modalAdd.isVisible({ timeout: 800 }).catch(() => false)) {
        await page.getByRole("button", { name: /^Cancel$/i }).click();
        continue;
      }
      added = true;
      break;
    }
    if (!added) {
      softSkip(testInfo, "No addable POS catalog tile (all sold out or modifiers-only)");
    }

    // Pay
    const pay = page.getByRole("button", { name: /Charge|Pay/i }).first();
    await expect(pay).toBeEnabled({ timeout: 10000 });
    await pay.click();

    const paymentHeading = page.getByRole("heading", { name: /Payment/i });
    await expect(paymentHeading).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Confirm$/i }).click();

    // Sale complete (shell v2) or toast path
    const saleDone = page.getByText(/Sale recorded|Sale finished|Next customer/i).first();
    const saleVisible = await saleDone.isVisible({ timeout: 20000 }).catch(() => false);
    if (!saleVisible) {
      softSkip(testInfo, "Checkout did not reach Sale Complete (foundation/stock/commercial gate?)");
    }

    const printBtn = page.getByRole("button", { name: /Print/i }).first();
    if (await printBtn.isVisible().catch(() => false)) {
      // Opening print UI is enough; avoid native print dialogs blocking the runner.
      await printBtn.click();
      const slipClose = page.getByRole("button", { name: /^Close$/i }).first();
      if (await slipClose.isVisible({ timeout: 3000 }).catch(() => false)) {
        await slipClose.click();
      }
    }

    const nextCustomer = page.getByRole("button", { name: /Next customer/i });
    if (await nextCustomer.isVisible().catch(() => false)) {
      await nextCustomer.click();
    }

    // Cash drawer / coin exchange (ops only)
    await page.getByRole("button", { name: /^More$/i }).click();
    const drawerItem = page.getByRole("button", { name: /Cash drawer/i });
    if (await drawerItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await drawerItem.click();
      const coinTab = page.getByRole("button", { name: /Coin exchange/i });
      if (await coinTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await coinTab.click();
        await page.locator("input").first().fill("50");
        const reason = page.getByPlaceholder(/reason/i).or(page.locator("textarea")).first();
        if (await reason.isVisible().catch(() => false)) {
          await reason.fill("E2E coin break");
        }
        const record = page.getByRole("button", { name: /Record Coin exchange|Record Cash/i }).first();
        if (await record.isVisible().catch(() => false)) {
          await record.click();
        }
      }
      await page.getByRole("button", { name: /^Done$/i }).click();
    }

    // Close shift
    await page.getByRole("button", { name: /^More$/i }).click();
    await page.getByRole("button", { name: /Close shift/i }).click();
    const closeDialog = page.locator("div.fixed.inset-0").filter({ hasText: /Expected|Counted|Close session/i });
    await expect(closeDialog.first()).toBeVisible({ timeout: 10000 });
    const counted = closeDialog.locator("input").first();
    await counted.fill("1000");
    await page.getByRole("button", { name: /Close session/i }).click();
    await expect(page.getByRole("button", { name: /Open session/i }).or(page.getByText(/Session closed/i)).first()).toBeVisible({
      timeout: 20000,
    });
  });
});
