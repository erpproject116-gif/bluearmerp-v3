import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, apiNetworkErrorMessage, supabase } from "../../shared/api";
import { getActiveTenantId, setActiveTenantId } from "../../shared/activeContext";
import { useAuth, type MeData } from "../../shared/auth-context";

function debugLog(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
  // #region agent log
  fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a1498a" },
    body: JSON.stringify({
      sessionId: "a1498a",
      runId: "pre-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function fetchMeWithRetry(maxAttempts = 4): Promise<Awaited<ReturnType<typeof apiFetch<MeData>>>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      debugLog("AuthCallbackPage.tsx:fetchMe", "attempt", { attempt, activeTenantId: getActiveTenantId() }, "H1-H2");
      return await apiFetch<MeData>("/api/v1/auth/me", {}, { silent: true });
    } catch (err) {
      lastErr = err;
      debugLog("AuthCallbackPage.tsx:fetchMe", "attempt failed", { attempt, err: String(err) }, "H1-H6");
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  onMount(async () => {
    debugLog("AuthCallbackPage.tsx:onMount", "callback start", { href: window.location.href }, "H6");
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") ?? params.get("error");
    if (oauthError) {
      navigate(`/signin?error=${encodeURIComponent(oauthError)}`, { replace: true });
      return;
    }

    const code = params.get("code");
    if (!code) {
      navigate(`/signin?error=${encodeURIComponent("Missing OAuth code in callback URL.")}`, {
        replace: true,
      });
      return;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      debugLog("AuthCallbackPage.tsx:exchange", "supabase exchange failed", { error: error?.message }, "H6");
      navigate(
        `/signin?error=${encodeURIComponent(error?.message ?? "Sign-in failed. Try again.")}`,
        { replace: true },
      );
      return;
    }

    window.history.replaceState({}, document.title, "/auth/callback");

    try {
      const me = await fetchMeWithRetry();
      if (!me.success && (me.status === 403 || me.code === "ERR_FORBIDDEN")) {
        const prov = await apiFetch<{ tenant_id: number }>(
          "/api/v1/demo/provision",
          { method: "POST", body: "{}" },
          { silent: true },
        );
        if (prov.success && prov.data?.tenant_id) {
          setActiveTenantId(prov.data.tenant_id);
        }
      }

      await auth.refresh();
      debugLog("AuthCallbackPage.tsx:done", "navigating to app", {}, "H6");
      navigate("/app/inventory/partners", { replace: true });
    } catch {
      debugLog("AuthCallbackPage.tsx:catch", "auth/me failed after retries", {}, "H1-H6");
      navigate(
        `/signin?error=${encodeURIComponent(apiNetworkErrorMessage())}`,
        { replace: true },
      );
    }
  });

  return (
    <div class="flex min-h-screen items-center justify-center bg-body">
      <div class="rounded-xl border border-stroke bg-white px-8 py-6 text-center shadow-sm">
        <div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p class="text-sm text-text-secondary">Completing sign-in…</p>
      </div>
    </div>
  );
}
