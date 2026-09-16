/**
 * Error-path UX.
 *
 * Most of the suite checks that the happy path works. These checks look at what
 * a first-time user sees when it does not: whether the app names the field that
 * is wrong and the action that fixes it, or just says something failed.
 *
 * Read-only by design. Saves here are expected to be rejected, and the mutation
 * guard is drained deliberately so an attempted write is reported as a finding
 * rather than failing the test.
 */
import { test, expect } from "./helpers/fixtures";
import type { Page } from "@playwright/test";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { drainBlockedMutations, writeEvidence } from "./helpers/liveSafety";
import { openNewRow, expectModalHeading, cancelEntityModal, saveEntityModal } from "./helpers/entityForm";
import { annotateBlocked } from "./helpers/prerequisites";

/** Wording that tells the user nothing about what to do next. */
const UNHELPFUL = /^(error|failed|failure|something went wrong|bad request|invalid|unknown error|400|422|500)[.! ]*$/i;

/** A useful message names a field, a record, or an action. */
const ACTIONABLE = /(required|select|choose|enter|add|missing|at least one|must|cannot be empty|no lines|customer|supplier|vendor|item|unit|date|quantity|confirm)/i;

/** Collect anything the UI is currently showing as an error or warning. */
async function visibleMessages(page: Page): Promise<string[]> {
  const candidates = page.locator(
    '[role="alert"], [aria-live], .text-red-500, .text-red-600, .text-rose-600, .text-danger, [data-error], p.text-red-600, span.text-red-600',
  );
  const n = await candidates.count();
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, 40); i++) {
    const t = (await candidates.nth(i).innerText().catch(() => ""))?.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function assertActionable(messages: string[], context: string) {
  expect(
    messages.length,
    `${context}: the save was rejected but nothing visible explained why. A first-time user is stuck here.`,
  ).toBeGreaterThan(0);

  const useless = messages.filter((m) => UNHELPFUL.test(m));
  const helpful = messages.filter((m) => ACTIONABLE.test(m));

  expect(
    helpful.length,
    `${context}: no message named a field or an action.\nShown:\n  ${messages.join("\n  ")}\n` +
      (useless.length ? `Generic-only text: ${useless.join(" | ")}` : ""),
  ).toBeGreaterThan(0);
}

test.describe("Error paths — blocked saves explain themselves", () => {
  test("@read-only quotation: saving an empty form names what is missing", async ({ page }, testInfo) => {
    test.setTimeout(3 * 60 * 1000);
    await ensureSignedIn(page);
    await page.goto("/app/quotation/quotations");
    await assertApiReachable(page);

    try {
      await openNewRow(page);
      await expectModalHeading(page, /New Quotation/i);
    } catch (e) {
      annotateBlocked(
        testInfo,
        "environment-blocked",
        `Could not open the New Quotation form: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Deliberately save with no customer and no lines.
    await saveEntityModal(page, /New Quotation/i).catch(() => undefined);
    await page.waitForTimeout(1500);

    const messages = await visibleMessages(page);
    const attemptedWrite = drainBlockedMutations();
    writeEvidence("error-path-quotation-empty.json", { messages, attemptedWrite });

    assertActionable(messages, "Quotation saved with no customer and no lines");

    await cancelEntityModal(page, /New Quotation/i).catch(() => undefined);
  });

  test("@read-only sales: saving without a customer names the customer field", async ({ page }, testInfo) => {
    test.setTimeout(3 * 60 * 1000);
    await ensureSignedIn(page);
    await page.goto("/app/sales/sales");
    await assertApiReachable(page);

    try {
      await openNewRow(page);
      await expectModalHeading(page, /New Sale|New Sales/i);
    } catch (e) {
      annotateBlocked(
        testInfo,
        "environment-blocked",
        `Could not open the New Sales form: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    await saveEntityModal(page, /New Sale|New Sales/i).catch(() => undefined);
    await page.waitForTimeout(1500);

    const messages = await visibleMessages(page);
    const attemptedWrite = drainBlockedMutations();
    writeEvidence("error-path-sales-no-customer.json", { messages, attemptedWrite });

    assertActionable(messages, "Sales saved with no customer");

    await cancelEntityModal(page, /New Sale|New Sales/i).catch(() => undefined);
  });

  test("@read-only goods receipt: an empty queue says what to do next", async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);
    await ensureSignedIn(page);
    await page.goto("/app/purchase-order/goods-receipt");
    await assertApiReachable(page);

    const main = page.locator("main, table, h1, h2").first();
    await expect(main).toBeVisible({ timeout: 20000 });

    const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
    const rowCount = await rows.count().catch(() => 0);
    if (rowCount > 0) {
      // Receiving is possible; nothing to assert about guidance.
      drainBlockedMutations();
      return;
    }

    // Nothing to receive. A purchase order only becomes receivable once it is
    // confirmed, and that is exactly what a new user does not know.
    const body = (await page.locator("main").first().innerText().catch(() => "")) ?? "";
    const guidance = /confirm|purchase order|no .*(receive|receipt)|nothing to receive|create/i.test(body);
    writeEvidence("error-path-gr-empty.json", { rowCount, bodySample: body.slice(0, 600) });

    expect(
      guidance,
      "Goods receipt has nothing to receive but the screen does not explain that a purchase order must be confirmed first.\n" +
        `Screen text:\n${body.slice(0, 600)}`,
    ).toBe(true);

    drainBlockedMutations();
  });
});
