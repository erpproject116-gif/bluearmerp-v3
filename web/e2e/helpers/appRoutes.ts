import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RoutesFixture = {
  smokeable: string[];
  totals: { smokeable: number; all: number };
};

function loadFixture(): RoutesFixture {
  const file = path.join(__dirname, "../fixtures/app-routes.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as RoutesFixture;
}

const routeFixture = loadFixture();

/** High-traffic screens for default CI smoke (subset of smokeable). */
export const CORE_APP_ROUTES: string[] = [
  "/app/dashboard",
  "/app/inventory/partners",
  "/app/inventory/items",
  "/app/inventory/locations",
  "/app/quotation/quotations",
  "/app/quotation/tax-mngt/tax-types",
  "/app/sales-order/sales-orders",
  "/app/sales/sales",
  "/app/purchase-request/purchase-requests",
  "/app/purchase-order/purchase-orders",
  "/app/purchase-order/rfq",
  "/app/purchase-order/goods-receipt",
  "/app/purchases/purchases",
  "/app/finance/official-receipts",
  "/app/finance/payment-vouchers",
  "/app/finance/acct-i/chart-of-accounts",
  "/app/finance/acct-i/journal-entries",
  "/app/operations",
  "/app/operations/calendar",
  "/app/setup",
  "/app/documentation",
  "/app/user-management/process-policies",
];

export function allSmokeableRoutes(): string[] {
  return [...routeFixture.smokeable];
}

export function routesForSmoke(): string[] {
  if (process.env.E2E_FULL_ROUTE_SMOKE === "1") return allSmokeableRoutes();
  return [...CORE_APP_ROUTES];
}

type VisitResult = { path: string; ok: boolean; detail?: string };

/**
 * Visit a route after auth. Soft-checks: stayed in app, no pageerror, body has content.
 */
export async function visitAppRoute(page: Page, routePath: string): Promise<VisitResult> {
  const pageErrors: string[] = [];
  const onError = (err: Error) => pageErrors.push(err.message);
  page.on("pageerror", onError);
  try {
    const res = await page.goto(routePath, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Wait for shell (sidebar) — Solid lazy routes often leave body sparse for >400ms.
    await page
      .locator("nav, aside, [role='navigation'], h1, h2, table, main")
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => undefined);
    await page.waitForTimeout(300);

    const url = page.url();
    if (url.includes("/signin")) {
      return { path: routePath, ok: false, detail: `redirected to sign-in (status=${res?.status()})` };
    }
    if (pageErrors.length) {
      return { path: routePath, ok: false, detail: `pageerror: ${pageErrors[0]}` };
    }
    // ProtectedRoute can flash “Cannot reach the API” while the first /api call is in flight.
    const apiDown = page.getByText(/Cannot reach the API/i);
    if (await apiDown.isVisible().catch(() => false)) {
      await apiDown.waitFor({ state: "hidden", timeout: 8000 }).catch(() => undefined);
      if (await apiDown.isVisible().catch(() => false)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(500);
      }
      if (await apiDown.isVisible().catch(() => false)) {
        return {
          path: routePath,
          ok: false,
          detail: "API down (start: cd api && go run ./cmd/server)",
        };
      }
    }

    // Lazy chunks (e.g. /app/documentation) can briefly leave <body> with only shell chrome.
    let bodyText = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      bodyText = await page
        .locator("body")
        .innerText()
        .then((t) => t.trim())
        .catch(() => "");
      if (bodyText.length >= 20) break;
      await page.waitForTimeout(400 * (attempt + 1));
      if (attempt === 2) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
        await page
          .locator("nav, aside, [role='navigation'], h1, h2, table, main")
          .first()
          .waitFor({ state: "visible", timeout: 10000 })
          .catch(() => undefined);
      }
    }
    if (/Account not provisioned/i.test(bodyText)) {
      return { path: routePath, ok: false, detail: "demo Auth user not linked to DEMO000" };
    }
    if (bodyText.length < 20) {
      return { path: routePath, ok: false, detail: "body nearly empty" };
    }
    return { path: routePath, ok: true };
  } catch (e) {
    return { path: routePath, ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    page.off("pageerror", onError);
  }
}

export async function visitRoutesCollectFailures(page: Page, paths: string[]): Promise<VisitResult[]> {
  const failures: VisitResult[] = [];
  for (const p of paths) {
    const r = await visitAppRoute(page, p);
    if (!r.ok) failures.push(r);
  }
  return failures;
}
