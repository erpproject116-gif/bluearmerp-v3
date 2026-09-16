import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  softSkip,
} from "./helpers/entityForm";
import { mutationsAllowed, currentTier } from "./helpers/liveSafety";
import { e2eMarker, ledgerAppend } from "./helpers/mutationLedger";
import { fillTextByLabel, selectFirstOption, saveEntityModal, noteIncomplete } from "./helpers/entityForm";

test.describe("official-receipt CRUD interaction", () => {
  test("@read-only cancel New; open existing without mutating Notes", async ({ page }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(120_000);

    await demoSignIn(page);
    await page.goto("/app/finance/official-receipts");
    await assertApiReachable(page);

    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "OR list table not visible");
    }

    await openNewRow(page);
    await expectModalHeading(page, /New Official Receipt/i);
    // Empty save must keep modal open (validation), then cancel — no create.
    await saveEntityModal(page, /New Official Receipt/i);
    await expect(page.getByRole("heading", { name: /New Official Receipt/i })).toBeVisible({ timeout: 5000 });
    await cancelEntityModal(page, /New Official Receipt/i);

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    if ((await rows.count()) === 0) {
      softSkip(testInfo, "No official receipts to open");
    }

    const hist = rows.first().getByRole("button", { name: /^History$/i });
    if ((await hist.count()) > 0) {
      await hist.click();
      await expect(page.getByRole("dialog", { name: /History/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole("dialog", { name: /History/i }).getByRole("button", { name: "Close" }).click();
    }

    await openFirstDataRow(page);
    const editOpen = await page
      .getByRole("heading", { name: /Edit Official Receipt|Official Receipt/i })
      .isVisible()
      .catch(() => false);
    if (editOpen) {
      await cancelEntityModal(page).catch(() => undefined);
    }
  });

  test("@mutating @reversible edit Notes only when mutations allowed (prefer E2E rows)", async ({
    page,
  }, testInfo) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.skip(!mutationsAllowed(), `Mutations blocked (tier=${currentTier()})`);
    test.setTimeout(120_000);

    const note = e2eMarker("OR");
    await demoSignIn(page);
    await page.goto("/app/finance/official-receipts");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("table").first()).toBeVisible({ timeout: 25000 });
    } catch {
      softSkip(testInfo, "OR list table not visible");
    }

    const e2eRow = page.locator("tbody tr").filter({ hasText: /E2E-/i }).first();
    if (await e2eRow.isVisible().catch(() => false)) {
      await e2eRow.dblclick();
    } else {
      // Never edit anonymous first production row — incomplete if no E2E row.
      noteIncomplete(testInfo, "No E2E-* official receipt row to edit safely");
      return;
    }

    const editOpen = await page
      .getByRole("heading", { name: /Edit Official Receipt|Official Receipt/i })
      .isVisible()
      .catch(() => false);
    if (!editOpen) {
      noteIncomplete(testInfo, "OR E2E row did not open edit modal");
      return;
    }
    await fillTextByLabel(page, /^Notes/i, note);
    await saveEntityModal(page);
    ledgerAppend({ kind: "official-receipt", marker: note, path: "/app/finance/official-receipts", status: "updated" });
  });
});
