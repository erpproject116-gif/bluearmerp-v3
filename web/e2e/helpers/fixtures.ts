/**
 * Shared Playwright fixtures for live-safe runs.
 *
 * Specs should import `test` and `expect` from here rather than from
 * `@playwright/test`. Two protections then apply automatically:
 *
 *  1. The mutation guard is installed on every page and asserted after every
 *     test. Previously each spec had to remember `installMutationGuard`, and a
 *     spec that forgot ran completely unguarded against the live tenant.
 *  2. Missing authentication is reported honestly. A run that was told to
 *     expect auth fails loudly instead of skipping every test and exiting 0.
 *
 * Tag a test `@no-auth` when it deliberately runs signed out, such as the
 * sign-in page smoke check.
 *
 * The tenant pin lives in `ensureSignedIn`, because that is the first moment a
 * session actually exists to inspect.
 */
import { test as base, expect } from "@playwright/test";
import {
  assertNoBlockedMutations,
  assertNoMarkerViolations,
  installMutationGuard,
  mutationsAllowed,
  runOwned,
} from "./liveSafety";
import { ledgerAppend } from "./mutationLedger";
import { annotateBlocked } from "./prerequisites";
import { liveAuthAvailable } from "./storageAuth";

/** Set by jobs that genuinely have credentials, so absence becomes a failure. */
export function authIsRequired(): boolean {
  return process.env.E2E_REQUIRE_AUTH === "1";
}

export const test = base.extend<{ liveSafety: void }>({
  liveSafety: [
    async ({ page }, use, testInfo) => {
      const optedOut = /@no-auth/.test(testInfo.title);

      if (!optedOut && !liveAuthAvailable()) {
        if (authIsRequired()) {
          annotateBlocked(
            testInfo,
            "environment-blocked",
            "E2E_REQUIRE_AUTH=1 but no storage state and no demo or bench credentials were found. " +
              "Run npm run test:e2e:auth:save, or set E2E_DEMO_PASSWORD / E2E_BENCH_TOKEN.",
          );
        }
        testInfo.skip(true, "No auth available; set E2E_REQUIRE_AUTH=1 to make this a failure.");
      }

      const ownedBefore = mutationsAllowed() ? new Set(runOwned()) : new Set<string>();

      await installMutationGuard(page);
      try {
        await use();
      } finally {
        // Record anything this test created before asserting, so a run that ends in
        // failure still leaves a reversible trail.
        for (const record of runOwned()) {
          if (ownedBefore.has(record)) continue;
          ledgerAppend({ kind: "api-record", marker: record, path: record, status: "created" });
        }
      }
      assertNoBlockedMutations();
      assertNoMarkerViolations();
    },
    { auto: true },
  ],
});

export { expect };
