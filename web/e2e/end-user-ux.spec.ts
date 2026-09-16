import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { writeEvidence } from "./helpers/liveSafety";
import { readFileSync } from "node:fs";

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
  jargon: string[];
};

type UxBaseline = {
  capturedAt: string;
  tasks: Record<string, { maxClicks: number; maxFriction: number }>;
  summary: { maxTasksWithFriction: number; maxAvgClicks: number };
};

const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/ux-baseline.json", import.meta.url), "utf8"),
) as UxBaseline;

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

  // Terminology defects. These are tracked separately from friction because they are
  // never acceptable at any level, so they must not be absorbed by a baseline ceiling.
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
  const jargon: string[] = [];
  const internalNames = body.match(/acct-i{1,3}\b/gi) ?? [];
  if (internalNames.length) {
    jargon.push(`Internal module name shown to the user: ${[...new Set(internalNames)].join(", ")}`);
  }
  const invoiceNames = [...new Set((body.match(/Purchase Invoice|Purchase Receive|Supplier Invoice/gi) ?? []).map((m) => m.toLowerCase()))];
  if (invoiceNames.length > 2) {
    jargon.push(`Screen mixes ${invoiceNames.length} names for the same document: ${invoiceNames.join(", ")}`);
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
    jargon,
  };
}

test.describe("Non-technical end-user UX tasks", () => {
  test("@read-only measure guided tasks: first quote, receive PO, collect payment, find stock", async ({
    page,
  }) => {
    test.setTimeout(15 * 60 * 1000);

    await ensureSignedIn(page);

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

    const withFriction = results.filter((r) => r.friction.length).length;
    const avgClicks = results.reduce((a, r) => a + r.clicks, 0) / results.length;

    const evidencePath = writeEvidence("ux-task-results.json", {
      at: new Date().toISOString(),
      baselineCapturedAt: baseline.capturedAt,
      results,
      summary: {
        tasks: results.length,
        withFriction,
        avgClicks,
        avgMs: results.reduce((a, r) => a + r.elapsedMs, 0) / results.length,
      },
    });

    for (const r of results) {
      test.info().annotations.push({
        type: "ux-task",
        description: `${r.id}: clicks=${r.clicks} friction=${r.friction.join(";") || "none"} evidence=${evidencePath}`,
      });
    }

    expect(results.map((r) => r.id).sort()).toEqual(Object.keys(baseline.tasks).sort());

    // Terminology defects are never baselined. See docs/qa/ux-baseline.md.
    const jargon = results.flatMap((r) => r.jargon.map((j) => `${r.startPath}: ${j}`));
    expect(jargon, "Internal jargon or mixed document naming reached an end-user screen").toEqual([]);

    // Friction may not get worse than the committed baseline. Better is always allowed;
    // when a fix lands, lower the ceiling in fixtures/ux-baseline.json in the same PR.
    for (const r of results) {
      const ceiling = baseline.tasks[r.id];
      expect(
        r.friction.length,
        `Task "${r.label}" regressed: ${r.friction.join("; ")}`,
      ).toBeLessThanOrEqual(ceiling.maxFriction);
      expect(r.clicks, `Task "${r.label}" now costs more clicks than baseline`).toBeLessThanOrEqual(
        ceiling.maxClicks,
      );
    }

    expect(withFriction).toBeLessThanOrEqual(baseline.summary.maxTasksWithFriction);
    expect(avgClicks).toBeLessThanOrEqual(baseline.summary.maxAvgClicks);
  });
});
