import type { Page } from "@playwright/test";

/** Inject a Supabase-compatible session so the SPA can call the API with a minted bench JWT (CI). */
export async function seedBenchSession(page: Page, accessToken: string, supabaseHost = "127.0.0.1") {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const storageKey = `sb-${supabaseHost}-auth-token`;
  await page.addInitScript(
    ({ key, token, exp }) => {
      const session = {
        access_token: token,
        refresh_token: "ci-bench-refresh",
        expires_in: 3600,
        expires_at: exp,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "demo@demo.bluearm.local",
        },
      };
      localStorage.setItem(
        key,
        JSON.stringify({
          currentSession: session,
          expiresAt: exp * 1000,
        }),
      );
    },
    { key: storageKey, token: accessToken, exp: expiresAt },
  );
}

export function benchAuthAvailable(): boolean {
  return Boolean(process.env.E2E_BENCH_TOKEN);
}
