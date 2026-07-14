import type { Page } from "@playwright/test";

/** Fail fast on known bootstrap blockers after navigating into /app. */
export async function assertApiReachable(page: Page) {
  if (await page.getByText(/Cannot reach the API/i).isVisible().catch(() => false)) {
    throw new Error(
      "API is not reachable (UI shows “Cannot reach the API”). Start it: cd api && go run ./cmd/server  (port 8080; Vite proxies /api).",
    );
  }
  if (await page.getByText(/Account not provisioned/i).isVisible().catch(() => false)) {
    const signedIn = (await page.getByText(/Signed in as:/i).textContent().catch(() => "")) ?? "";
    const uuidMatch = signedIn.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const uuid = uuidMatch?.[0] ?? "<uuid-from-supabase-auth-users>";
    throw new Error(
      [
        "Demo Auth user is not linked to tenant DEMO000.",
        `Auth UUID: ${uuid}`,
        "Link it (Supabase SQL Editor or psql):",
        `  psql "$DATABASE_URL" -v auth_uuid="'${uuid}'" -f scripts/link-demo-auth-user.sql`,
        "See docs/runbooks/sql-run-order.md Phase 4b / docs/runbooks/demo-seed-data.md",
      ].join("\n"),
    );
  }
}
