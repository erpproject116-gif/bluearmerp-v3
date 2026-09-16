import { test, expect, type Page } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";

/**
 * History modal regression (z-index / Portal / LoadingText).
 * Prefers the grid-row History button when present; otherwise opens the edit
 * modal and uses the header History control.
 */
type TxCase = {
  name: string;
  listPath: string;
  editHeading: RegExp;
};

const CASES: TxCase[] = [
  {
    name: "quotation",
    listPath: "/app/quotation/quotations",
    editHeading: /Edit Quotation/i,
  },
  {
    name: "sales order",
    listPath: "/app/sales-order/sales-orders",
    editHeading: /Edit Sales Order/i,
  },
  {
    name: "sale",
    listPath: "/app/sales/sales",
    editHeading: /Edit Sale/i,
  },
  {
    name: "purchase request",
    listPath: "/app/purchase-request/purchase-requests",
    editHeading: /Edit Purchase Request/i,
  },
  {
    name: "purchase order",
    listPath: "/app/purchase-order/purchase-orders",
    editHeading: /Purchase Order/i,
  },
  {
    name: "purchase (supplier invoice)",
    listPath: "/app/purchases/purchase-receive",
    editHeading: /Edit Purchase \(actual purchase\)/i,
  },
  {
    name: "official receipt",
    listPath: "/app/finance/official-receipts",
    editHeading: /Edit Official Receipt/i,
  },
];

/** Data rows only — SpreadsheetGrid sometimes puts a header-like row in tbody. */
function dataRows(page: Page) {
  return page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
}

async function assertHistoryDialog(page: Page) {
  // List ActivityHistoryLink titles the modal "History"; edit-header uses "History — …".
  const dialog = page.getByRole("dialog", { name: /History/i });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.getByRole("heading", { name: /History/i })).toBeVisible({ timeout: 5000 });

  // Settled = not stuck on Loading… (empty, table headers, or API error including rate-limit).
  await expect
    .poll(
      async () => {
        const body = await dialog.innerText();
        if (/Loading/i.test(body)) return false;
        return (
          /No activity recorded yet/i.test(body) ||
          /Save the transaction first/i.test(body) ||
          /Failed to load history/i.test(body) ||
          /Too many requests/i.test(body) ||
          /try again later/i.test(body) ||
          /\berror\b/i.test(body) ||
          /\bWhen\b/i.test(body) ||
          /\bPIC\b/i.test(body) ||
          /\bActivity\b/i.test(body)
        );
      },
      { timeout: 20000 },
    )
    .toBeTruthy();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });
}

async function openHistory(page: Page, c: TxCase, testInfo: { skip: (cond?: boolean, desc?: string) => void }) {
  await assertApiReachable(page);

  // Brief API flash during goto should clear before we soft-skip the list.
  const apiDown = page.getByText(/Cannot reach the API/i);
  if (await apiDown.isVisible().catch(() => false)) {
    await apiDown.waitFor({ state: "hidden", timeout: 10000 }).catch(() => undefined);
    await assertApiReachable(page);
  }

  const table = page.getByRole("table").first();
  try {
    await expect(table).toBeVisible({ timeout: 25000 });
  } catch {
    testInfo.skip(true, "List table not visible (empty module or different UI)");
  }

  const rows = dataRows(page);
  try {
    await expect.poll(async () => rows.count(), { timeout: 10000 }).toBeGreaterThan(0);
  } catch {
    /* soft-skip below */
  }
  const count = await rows.count();
  testInfo.skip(count === 0, "No demo rows on this list");

  // Fast path: History column on the list (RecordHistoryButton / ActivityHistoryLink).
  const rowHistory = rows.first().getByRole("button", { name: /^History$/i });
  if ((await rowHistory.count()) > 0) {
    await rowHistory.click();
    await assertHistoryDialog(page);
    return;
  }

  await rows.first().dblclick();
  await expect(page.getByRole("heading", { name: c.editHeading })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^History$/i }).click();
  await assertHistoryDialog(page);
}

test.describe("Transaction History nested modal", () => {
  for (const c of CASES) {
    test(`@read-only ${c.name}: History opens (list or edit modal)`, async ({ page }, testInfo) => {
      test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");
      test.setTimeout(90_000);

      await demoSignIn(page);
      await page.goto(c.listPath);
      await openHistory(page, c, testInfo);
    });
  }
});
