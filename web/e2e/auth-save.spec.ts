import { test as base, expect } from "@playwright/test";
import { demoAuthAvailable } from "./helpers/demoSignIn";
import { saveStorageState } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";

/**
 * One-time: save Playwright storageState for the configured account.
 * Requires E2E_DEMO_PASSWORD (or DEMO_USER_PASSWORD) for the live tenant user.
 */
base("@auth-save save storage state for live account", async ({ page }) => {
  base.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD / E2E_DEMO_EMAIL for this account");
  base.setTimeout(90_000);
  const out = await saveStorageState(page);
  await assertApiReachable(page);
  expect(out).toMatch(/user\.json$/);
  console.log(`[e2e-auth] wrote ${out}`);
});
