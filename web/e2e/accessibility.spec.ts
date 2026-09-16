/**
 * Accessibility scan of the busiest routes.
 *
 * Scope is deliberate: the twenty screens a working day actually passes through,
 * not every route in the app. A scan nobody can finish reading is a scan nobody
 * acts on. Only serious and critical findings fail, because those are the ones
 * that stop a keyboard or screen-reader user from completing a job; moderate and
 * minor are recorded in evidence for later.
 *
 * Read-only by default. The mutation guard from the shared fixture applies, so a
 * scan can never write to the tenant.
 */
import { test, expect } from "./helpers/fixtures";
import AxeBuilder from "@axe-core/playwright";
import { ensureSignedIn } from "./helpers/storageAuth";
import { writeEvidence } from "./helpers/liveSafety";

/** The screens a day of real work passes through. */
const ROUTES = [
  "/app/home",
  "/app/quotation/quotations",
  "/app/sales/sales-orders",
  "/app/sales/sales",
  "/app/sales/customers",
  "/app/purchases/purchase-requests",
  "/app/purchases/purchase-orders",
  "/app/purchases/purchase-receive",
  "/app/purchases/vendors",
  "/app/inventory/items",
  "/app/inventory/find-stock",
  "/app/inventory/stock-movements",
  "/app/finance/official-receipts",
  "/app/finance/payment-vouchers",
  "/app/finance/journal-entries",
  "/app/finance/chart-of-accounts",
  "/app/reports/sales-summary",
  "/app/reports/inventory-summary",
  "/app/setup/user-management",
  "/app/setup/process-policies",
];

type Finding = {
  route: string;
  id: string;
  impact: string;
  help: string;
  nodes: number;
  sample: string;
};

test.describe("Accessibility", () => {
  test("@read-only @a11y no serious or critical violations on the daily routes", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    await ensureSignedIn(page);

    const blocking: Finding[] = [];
    const advisory: Finding[] = [];
    const unreachable: string[] = [];

    for (const route of ROUTES) {
      await page.goto(route);
      const loaded = await page
        .locator("main, table, h1, h2, [role='main']")
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => true)
        .catch(() => false);

      if (!loaded) {
        unreachable.push(route);
        continue;
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      for (const v of results.violations) {
        const finding: Finding = {
          route,
          id: v.id,
          impact: v.impact ?? "unknown",
          help: v.help,
          nodes: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        };
        if (v.impact === "serious" || v.impact === "critical") blocking.push(finding);
        else advisory.push(finding);
      }
    }

    const evidencePath = writeEvidence("accessibility.json", {
      at: new Date().toISOString(),
      routesScanned: ROUTES.length - unreachable.length,
      unreachable,
      blocking,
      advisory,
    });

    test.info().annotations.push({
      type: "a11y",
      description: `blocking=${blocking.length} advisory=${advisory.length} unreachable=${unreachable.length} evidence=${evidencePath}`,
    });

    // A route that will not load is its own problem and must not read as a clean scan.
    expect(unreachable, "Routes that never rendered, so they were never scanned").toEqual([]);

    const summary = blocking
      .map((f) => `${f.route}  ${f.impact.padEnd(8)} ${f.id} (${f.nodes} node(s)) - ${f.help}`)
      .join("\n");
    expect(blocking, `Serious or critical accessibility violations:\n${summary}`).toEqual([]);
  });
});
