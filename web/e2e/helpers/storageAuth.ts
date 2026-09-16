import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./demoSignIn";
import { assertApiReachable } from "./apiReady";
import { currentTier, mutationsAllowed } from "./liveSafety";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function authStatePath(): string {
  return (
    process.env.E2E_STORAGE_STATE?.trim() ||
    path.join(__dirname, "../.auth/user.json")
  );
}

export function storageAuthAvailable(): boolean {
  return fs.existsSync(authStatePath());
}

/** Prefer storageState file, else demo/bench sign-in. */
export function liveAuthAvailable(): boolean {
  return storageAuthAvailable() || demoAuthAvailable();
}

/**
 * Tenant this run is pinned to. Opt-in via E2E_EXPECT_TENANT_CODE.
 *
 * Deliberately not defaulted from the tenant profile: that file ships demo
 * values, and silently pinning to them would fail every CI run against a
 * throwaway database while giving live runs a false sense of protection.
 * Live mutating runs set it explicitly (see the test:e2e:live:* scripts).
 */
export function expectedTenantCode(): string {
  return (process.env.E2E_EXPECT_TENANT_CODE ?? "").trim();
}

/**
 * Refuse to continue when a mutating run is pointed at the wrong workspace.
 * A stale storage state is the realistic way this goes wrong, and the cost of
 * being wrong is writing real documents into someone else's tenant.
 */
export async function assertExpectedTenant(page: Page) {
  const expected = expectedTenantCode();
  if (!expected) return;
  const hints = await captureSessionHints(page);
  if (!hints.tenantCode) {
    throw new Error(
      `Live safety: tier=${currentTier()} allows mutations but the tenant could not be read from /auth/me. Refusing to continue.`,
    );
  }
  if (hints.tenantCode !== expected) {
    throw new Error(
      `Live safety: signed in to tenant ${hints.tenantCode}, but this run is pinned to ${expected}. Refusing to mutate.`,
    );
  }
}

/**
 * Ensure the page is authenticated.
 * When Playwright `use.storageState` is set, this only navigates and validates.
 * Otherwise falls back to demoSignIn.
 */
export async function ensureSignedIn(page: Page) {
  if (storageAuthAvailable() && process.env.E2E_USE_STORAGE_STATE !== "0") {
    await page.goto("/app/dashboard");
    await page.waitForURL("**/app/**", { timeout: 25000 }).catch(() => undefined);
    if (page.url().includes("/signin")) {
      throw new Error(
        `Storage state expired or invalid (${authStatePath()}). Re-run: npm run test:e2e:auth:save`,
      );
    }
    await assertApiReachable(page);
  } else {
    await demoSignIn(page);
  }
  if (mutationsAllowed()) {
    await assertExpectedTenant(page);
  }
}

/**
 * Capture auth via email/password into gitignored e2e/.auth/user.json.
 * Run headed once for the live tenant account.
 */
export async function saveStorageState(page: Page) {
  await demoSignIn(page);
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/app\//);
  const out = authStatePath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.context().storageState({ path: out });
  return out;
}

/** Read tenant/user hints from /auth/me when available (best-effort). */
export async function captureSessionHints(page: Page): Promise<{
  tenantCode?: string;
  email?: string;
  roleHints?: string[];
}> {
  const hints: { tenantCode?: string; email?: string; roleHints?: string[] } = {};
  try {
    const me = await page.evaluate(async () => {
      const res = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    });
    const data = me?.data ?? me;
    if (data?.tenant?.code) hints.tenantCode = String(data.tenant.code);
    if (data?.user?.email) hints.email = String(data.user.email);
    if (Array.isArray(data?.permissions)) {
      hints.roleHints = data.permissions.slice(0, 20).map(String);
    }
  } catch {
    // best-effort
  }
  return hints;
}
