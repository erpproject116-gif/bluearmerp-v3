import type { Page } from "@playwright/test";

/**
 * Match @supabase/supabase-js storageKey derivation.
 * For URL http://127.0.0.1 the client uses `sb-127-auth-token`, not
 * `sb-127.0.0.1-auth-token`. Seeding the wrong key is why demo-smoke hung on
 * /signin after a "successful" bench JWT mint.
 */
export function supabaseAuthStorageKey(supabaseUrl: string): string {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split(".")[0] || host;
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-127-auth-token";
  }
}

/**
 * Inject a Supabase-compatible session so the SPA can call the API with a minted
 * bench JWT (CI). Value must be the session object itself — modern auth-js
 * rejects the old `{ currentSession, expiresAt }` wrapper via `_isValidSession`.
 */
export async function seedBenchSession(
  page: Page,
  accessToken: string,
  supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1",
) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const storageKey = supabaseAuthStorageKey(supabaseUrl);
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
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, token: accessToken, exp: expiresAt },
  );
}

export function benchAuthAvailable(): boolean {
  return Boolean(process.env.E2E_BENCH_TOKEN);
}
