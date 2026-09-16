import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { routesForSmoke, allSmokeableRoutes, visitRoutesCollectFailures } from "./helpers/appRoutes";

test.describe("App route smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("@smoke @read-only core (or full) static /app routes load without pageerror", async ({ page }) => {
    // Full mode paces itself around deployed API rate limits (~200 req/min/user),
    // so ~190 tenant app routes can legitimately take half an hour.
    test.setTimeout(process.env.E2E_FULL_ROUTE_SMOKE === "1" ? 60 * 60 * 1000 : 6 * 60 * 1000);

    await ensureSignedIn(page);
    const paths = routesForSmoke();
    expect(paths.length).toBeGreaterThan(10);

    const failures = await visitRoutesCollectFailures(page, paths);
    if (failures.length) {
      const summary = failures.map((f) => `${f.path}: ${f.detail}`).join("\n");
      expect(failures, `Route smoke failures (${failures.length}/${paths.length}):\n${summary}`).toEqual([]);
    }
  });

  test("@smoke @read-only fixture smokeable count stays in expected range", async () => {
    const all = allSmokeableRoutes();
    expect(all.length).toBeGreaterThan(150);
    expect(all.every((p) => p.startsWith("/app/"))).toBeTruthy();
  });
});
