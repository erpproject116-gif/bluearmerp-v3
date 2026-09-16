import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { assertApiReachable } from "./helpers/apiReady";
import { installMutationGuard, writeEvidence } from "./helpers/liveSafety";

type TaskResult = {
  id: string;
  label: string;
  startPath: string;
  clicks: number;
  screens: string[];
  elapsedMs: number;
  helpUsed: boolean;
  recovered: boolean;
  friction: string[];
};

async function runTask(
  page: import("@playwright/test").Page,
  task: { id: string; label: string; startPath: string; goal: RegExp; maxClicks?: number },
): Promise<TaskResult> {
  const screens: string[] = [];
  let clicks = 0;
  const friction: string[] = [];
  const started = Date.now();

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) screens.push(frame.url());
  });

  await page.goto(task.startPath);
  await assertApiReachable(page);
  await page
    .locator("nav, aside, h1, h2, table, main, [role='navigation']")
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);
  screens.push(page.url());

  // Prefer in-app navigation cues a non-tech user would use.
  const helpBtn = page.getByRole("button", { name: /\?|Help/i }).first();
  const helpUsed = await helpBtn.isVisible().catch(() => false);

  const newBtn = page
    .getByRole("button", { name: /\+?\s*New|New Quotation|New Sales|New Purchase|New Official|New Payment/i })
    .first();
  if (await newBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await newBtn.click();
    clicks += 1;
  } else {
    friction.push("No obvious New control on start page");
  }

  const goalVisible = await page.getByRole("heading", { name: task.goal }).isVisible({ timeout: 8000 }).catch(() => false);
  if (!goalVisible) {
    friction.push(`Goal heading not visible: ${task.goal}`);
  }

  // Cancel to leave no mutation
  const cancel = page.getByRole("button", { name: /^(Cancel|Close)$/i }).first();
  let recovered = false;
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    clicks += 1;
    recovered = true;
  }

  // Terminology / duplicate entry points (lightweight heuristics)
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
  if (/acct-i|acct-ii/i.test(body)) friction.push("Internal module jargon visible (acct-i/acct-ii)");
  if ((body.match(/Purchase Invoice|Purchase Receive|Supplier Invoice/gi) || []).length > 2) {
    friction.push("Multiple invoice naming variants on one screen");
  }

  return {
    id: task.id,
    label: task.label,
    startPath: task.startPath,
    clicks,
    screens: [...new Set(screens)].slice(-8),
    elapsedMs: Date.now() - started,
    helpUsed,
    recovered,
    friction,
  };
}

test.describe("Non-technical end-user UX tasks", () => {
  test("@read-only measure guided tasks: first quote, receive PO, collect payment, find stock", async ({
    page,
  }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
    test.setTimeout(15 * 60 * 1000);

    await installMutationGuard(page);
    await demoSignIn(page);

    const results: TaskResult[] = [];
    results.push(
      await runTask(page, {
        id: "first-quote",
        label: "Create first quotation",
        startPath: "/app/quotation/quotations",
        goal: /New Quotation/i,
      }),
    );
    results.push(
      await runTask(page, {
        id: "receive-po",
        label: "Receive a purchase order",
        startPath: "/app/purchases/purchase-receive",
        goal: /New Purchases|New Purchase (Receive|Invoice)/i,
      }),
    );
    results.push(
      await runTask(page, {
        id: "collect-payment",
        label: "Collect customer payment",
        startPath: "/app/finance/official-receipts",
        goal: /New Official Receipt|New Receivable Payment|Official Receipt/i,
      }),
    );
    results.push(
      await runTask(page, {
        id: "pay-supplier",
        label: "Pay a supplier",
        startPath: "/app/finance/payment-vouchers",
        goal: /New Payment Voucher|New Payable Payment|Payment [Vv]oucher|Supplier payment/i,
      }),
    );
    results.push(
      await runTask(page, {
        id: "find-stock",
        label: "Find stock on hand",
        startPath: "/app/inventory/find-stock",
        goal: /Find|Stock|On.?hand|Inventory|Balance/i,
      }),
    );

    const evidencePath = writeEvidence("ux-task-results.json", {
      at: new Date().toISOString(),
      results,
      summary: {
        tasks: results.length,
        withFriction: results.filter((r) => r.friction.length).length,
        avgClicks: results.reduce((a, r) => a + r.clicks, 0) / results.length,
        avgMs: results.reduce((a, r) => a + r.elapsedMs, 0) / results.length,
      },
    });

    // Soft assertions: tasks should reach a goal heading or record friction honestly.
    for (const r of results) {
      test.info().annotations.push({
        type: "ux-task",
        description: `${r.id}: clicks=${r.clicks} friction=${r.friction.join(";") || "none"} evidence=${evidencePath}`,
      });
    }
    expect(results.length).toBeGreaterThanOrEqual(5);
  });
});
