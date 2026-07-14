import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
import { routesForSmoke, allSmokeableRoutes, visitRoutesCollectFailures } from "./helpers/appRoutes";

test.describe("App route smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("core (or full) static /app routes load without pageerror", async ({ page }) => {
    test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN (CI) or E2E_DEMO_PASSWORD for authenticated smoke");
    test.setTimeout(process.env.E2E_FULL_ROUTE_SMOKE === "1" ? 20 * 60 * 1000 : 6 * 60 * 1000);

    await demoSignIn(page);
    const paths = routesForSmoke();
    expect(paths.length).toBeGreaterThan(10);

    const failures = await visitRoutesCollectFailures(page, paths);
    if (failures.length) {
      const summary = failures.map((f) => `${f.path}: ${f.detail}`).join("\n");
      expect(failures, `Route smoke failures (${failures.length}/${paths.length}):\n${summary}`).toEqual([]);
    }
  });

  test("fixture smokeable count stays in expected range", async () => {
    const all = allSmokeableRoutes();
    expect(all.length).toBeGreaterThan(150);
    expect(all.every((p) => p.startsWith("/app/"))).toBeTruthy();
  });
});
