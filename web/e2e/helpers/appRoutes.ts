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
  "/app/purchases/purchase-receive",
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
 * Visit a route after auth. Soft-checks: stayed in app, no pageerror, body has
 * content, and no API call returned a server error (5xx). Client errors (4xx)
 * are reported in the detail of other failures but do not fail on their own —
 * permission gates and optional probes legitimately 401/403/404.
 */
export async function visitAppRoute(
  page: Page,
  routePath: string,
  pageErrorRetry = false,
): Promise<VisitResult> {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const clientErrors: string[] = [];
  let rateLimited = false;
  const onError = (err: Error) => pageErrors.push(err.message);
  const onResponse = (res: import("@playwright/test").Response) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    const status = res.status();
    const short = `${status} ${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, "")}`;
    if (status === 429) rateLimited = true;
    if (status >= 500) serverErrors.push(short);
    else if (status >= 400 && status !== 401) clientErrors.push(short);
  };
  page.on("pageerror", onError);
  page.on("response", onResponse);
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
      // A rapid full-map run can receive delayed errors while the previous
      // page is being torn down. Re-open the route once from a blank document
      // to distinguish a real route error from cross-navigation noise.
      if (!pageErrorRetry) {
        page.off("pageerror", onError);
        page.off("response", onResponse);
        if (rateLimited || pageErrors.every((message) => /too many requests/i.test(message))) {
          console.warn(`[route-smoke] ${routePath}: pageerror after 429 — waiting 65s before isolated retry`);
          await page.waitForTimeout(65_000);
        }
        await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => undefined);
        return visitAppRoute(page, routePath, true);
      }
      return { path: routePath, ok: false, detail: `pageerror: ${pageErrors[0]}` };
    }
    // ProtectedRoute can flash “Cannot reach the API” while the first /api call is in flight.
    const apiDown = page.getByText(/Cannot reach the API/i);
    if (await apiDown.isVisible().catch(() => false)) {
      await apiDown.waitFor({ state: "hidden", timeout: 8000 }).catch(() => undefined);
      if ((await apiDown.isVisible().catch(() => false)) && rateLimited) {
        // Deployed APIs rate-limit per user per minute; rapid full-page visits
        // burst past it and /auth/me gets 429. Wait out the window once.
        console.warn(`[route-smoke] ${routePath}: rate-limited (429) — waiting 65s for the window to reset`);
        await page.waitForTimeout(65_000);
        rateLimited = false;
      }
      if (await apiDown.isVisible().catch(() => false)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(500);
      }
      if (await apiDown.isVisible().catch(() => false)) {
        const evidence = [...new Set([...serverErrors, ...clientErrors])].slice(0, 3).join("; ");
        return {
          path: routePath,
          ok: false,
          detail: evidence
            ? `API unreachable; recent API errors: ${evidence}`
            : "API down (start: cd api && go run ./cmd/server)",
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
    if (serverErrors.length) {
      return {
        path: routePath,
        ok: false,
        detail: `API 5xx during load: ${[...new Set(serverErrors)].slice(0, 3).join("; ")}`,
      };
    }
    if (clientErrors.length) {
      // Not fatal by itself, but surfaced so silent grid failures are visible.
      return {
        path: routePath,
        ok: true,
        detail: `API 4xx during load: ${[...new Set(clientErrors)].slice(0, 3).join("; ")}`,
      };
    }
    return { path: routePath, ok: true };
  } catch (e) {
    return { path: routePath, ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    page.off("pageerror", onError);
    page.off("response", onResponse);
  }
}

export async function visitRoutesCollectFailures(page: Page, paths: string[]): Promise<VisitResult[]> {
  const failures: VisitResult[] = [];
  for (const p of paths) {
    const r = await visitAppRoute(page, p);
    if (!r.ok) failures.push(r);
    else if (r.detail) console.warn(`[route-smoke] ${p}: ${r.detail}`);
  }
  return failures;
}
