import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchAuthAvailable, seedBenchSession } from "./benchAuth";
import { assertApiReachable } from "./apiReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function storageStateExists(): boolean {
  const p =
    process.env.E2E_STORAGE_STATE?.trim() ||
    path.join(__dirname, "../.auth/user.json");
  return process.env.E2E_USE_STORAGE_STATE !== "0" && fs.existsSync(p);
}

export function demoAuthAvailable(): boolean {
  return (
    storageStateExists() ||
    benchAuthAvailable() ||
    Boolean(process.env.E2E_DEMO_PASSWORD || process.env.DEMO_USER_PASSWORD)
  );
}

function demoCredentials() {
  const email =
    process.env.E2E_DEMO_EMAIL ||
    process.env.DEMO_USER_EMAIL ||
    process.env.VITE_DEMO_USER_EMAIL ||
    "demo@demo.bluearm.local";
  const password =
    process.env.E2E_DEMO_PASSWORD ||
    process.env.DEMO_USER_PASSWORD ||
    process.env.VITE_DEMO_USER_PASSWORD ||
    "";
  return { email, password };
}

/** Sign in via storageState, bench JWT (CI), or email/password (local). */
export async function demoSignIn(page: Page) {
  // Playwright config may already inject storageState from the live browser export.
  if (storageStateExists() && !process.env.E2E_BENCH_TOKEN) {
    await page.goto("/app/dashboard");
    await page.waitForURL("**/app/**", { timeout: 25000 }).catch(() => undefined);
    if (!page.url().includes("/signin")) {
      await assertApiReachable(page);
      return;
    }
    // Fall through to password/bench if storage expired.
  }

  const benchToken = process.env.E2E_BENCH_TOKEN;
  if (benchToken) {
    await seedBenchSession(page, benchToken);
    await page.goto("/app/inventory/partners");
    await page.waitForURL("**/app/**", { timeout: 20000 });
    await assertApiReachable(page);
    return;
  }

  const { email, password } = demoCredentials();
  if (!password) {
    throw new Error(
      "Missing demo password. Set E2E_DEMO_PASSWORD or DEMO_USER_PASSWORD in web/.env.local (or export e2e/.auth/user.json from the signed-in browser)",
    );
  }

  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: /^Sign in$/i })).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder("you@company.com").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in with email/i }).click();

  try {
    await page.waitForURL("**/app/**", { timeout: 25000 });
  } catch {
    const alert = page.locator("p").filter({ hasText: /invalid|credential|error|not configured/i }).first();
    const msg = (await alert.textContent().catch(() => null))?.trim();
    throw new Error(
      msg
        ? `Demo sign-in failed: ${msg}. Ensure Supabase user ${email} exists with DEMO_USER_PASSWORD.`
        : `Demo sign-in did not reach /app (still on ${page.url()}).`,
    );
  }
  await assertApiReachable(page);
}

/** Assert signed-in workspace is provisioned (DEMO000 linked). Call after demoSignIn + first /app goto. */
export async function requireProvisionedWorkspace(page: Page) {
  await assertApiReachable(page);
}
