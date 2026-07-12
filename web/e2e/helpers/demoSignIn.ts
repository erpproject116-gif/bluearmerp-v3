import type { Page } from "@playwright/test";
import { benchAuthAvailable, seedBenchSession } from "./benchAuth";

export function demoAuthAvailable(): boolean {
  return benchAuthAvailable() || Boolean(process.env.E2E_DEMO_PASSWORD);
}

/** Sign in via bench JWT (CI) or Try free demo (local). */
export async function demoSignIn(page: Page) {
  const benchToken = process.env.E2E_BENCH_TOKEN;
  if (benchToken) {
    await seedBenchSession(page, benchToken);
    await page.goto("/app/inventory/partners");
    await page.waitForURL("**/app/**", { timeout: 15000 });
    return;
  }
  await page.goto("/signin");
  await page.getByRole("button", { name: /Try free demo/i }).click();
  await page.waitForURL("**/app/**", { timeout: 15000 });
}
