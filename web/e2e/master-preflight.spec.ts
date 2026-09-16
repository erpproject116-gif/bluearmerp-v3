/**
 * Master-data preflight.
 *
 * A purchase order refused to save with `lines[0].unit_id` missing, and it
 * looked like a bug in the PO list. The real cause was five inventory items
 * with no base unit. Nothing in the suite checked tenant readiness, so a data
 * gap arrived disguised as a code defect.
 *
 * These checks read the API directly, so a failure names the missing master
 * record rather than a selector that did not appear.
 */
import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { writeEvidence } from "./helpers/liveSafety";
import { annotateBlocked } from "./helpers/prerequisites";

type Envelope<T> = { success?: boolean; data?: T; meta?: { total?: number } };

async function apiList<T>(
  page: import("@playwright/test").Page,
  path: string,
): Promise<{ rows: T[]; total: number }> {
  const result = await page.evaluate(async (p) => {
    const res = await fetch(p, { credentials: "include" });
    if (!res.ok) return { error: `${res.status} ${res.statusText}` };
    return { body: await res.json() };
  }, path);

  if ("error" in result && result.error) {
    throw new Error(`GET ${path} failed: ${result.error}`);
  }
  const body = (result as { body: Envelope<T[]> }).body;
  const rows = Array.isArray(body?.data) ? body.data : [];
  return { rows, total: body?.meta?.total ?? rows.length };
}

test.describe("Master-data preflight", () => {
  test("@read-only every item has a base unit", async ({ page }, testInfo) => {
    test.setTimeout(3 * 60 * 1000);
    await ensureSignedIn(page);

    const { rows, total } = await apiList<{
      id: number;
      item_code: string;
      item_name: string;
      base_unit_id: number | null;
    }>(page, "/api/v1/inventory/items?page=1&per_page=500");

    if (total === 0) {
      annotateBlocked(
        testInfo,
        "needs-seed",
        "No inventory items exist, so no trade job can be exercised.",
      );
    }

    const missing = rows
      .filter((i) => i.base_unit_id == null)
      .map((i) => `${i.item_code} (id ${i.id}) ${i.item_name}`);

    writeEvidence("master-preflight-items.json", {
      inspected: rows.length,
      total,
      missingBaseUnit: missing,
    });

    expect(
      missing,
      `Items with no base unit will fail to save on any purchase or stock document:\n${missing.join("\n")}\n` +
        `Fix by setting a base unit on each item, then re-run.`,
    ).toEqual([]);

    // Guard against a page-size lie: if the tenant has more items than one page,
    // say so rather than implying the whole catalogue was checked.
    expect(
      rows.length,
      `Only ${rows.length} of ${total} items were inspected; raise per_page or paginate.`,
    ).toBe(Math.min(total, 500));
  });

  test("@read-only the tenant has the master records a trade job needs", async ({ page }, testInfo) => {
    test.setTimeout(3 * 60 * 1000);
    await ensureSignedIn(page);

    const checks: { label: string; path: string; hint: string }[] = [
      {
        label: "customers",
        path: "/api/v1/inventory/partners?page=1&per_page=1&kind=customer",
        hint: "Add a customer under Sales > Customers before selling.",
      },
      {
        label: "vendors",
        path: "/api/v1/inventory/partners?page=1&per_page=1&kind=vendor",
        hint: "Add a vendor under Purchase > Vendors before buying.",
      },
      {
        label: "locations",
        path: "/api/v1/inventory/locations?page=1&per_page=1",
        hint: "Add at least one stock location; documents need somewhere to move stock.",
      },
      {
        label: "tax types",
        path: "/api/v1/quotation/tax-types?page=1&per_page=1",
        hint: "Define a tax type so document totals can be computed.",
      },
      {
        label: "chart of accounts",
        path: "/api/v1/finance/accounts?page=1&per_page=1",
        hint: "Load a chart of accounts so postings have somewhere to land.",
      },
    ];

    const empty: string[] = [];
    const summary: Record<string, number | string> = {};

    for (const check of checks) {
      try {
        const { total } = await apiList(page, check.path);
        summary[check.label] = total;
        if (total === 0) empty.push(`${check.label}: ${check.hint}`);
      } catch (e) {
        summary[check.label] = `error: ${e instanceof Error ? e.message : String(e)}`;
        empty.push(`${check.label}: could not be read (${summary[check.label]})`);
      }
    }

    writeEvidence("master-preflight-masters.json", summary);

    expect(
      empty,
      `Tenant is not ready for trade jobs:\n${empty.join("\n")}`,
    ).toEqual([]);

    if (testInfo.errors.length === 0) {
      testInfo.annotations.push({
        type: "preflight",
        description: Object.entries(summary)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
      });
    }
  });
});
