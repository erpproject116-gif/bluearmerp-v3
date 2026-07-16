import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, apiNetworkErrorMessage, supabase } from "../../shared/api";
import { setActiveTenantId } from "../../shared/activeContext";
import { useAuth, type MeData } from "../../shared/auth-context";
import { resolveAppEntryPath } from "../../shared/resolveAppEntryPath";

async function fetchMeWithRetry(maxAttempts = 4): Promise<Awaited<ReturnType<typeof apiFetch<MeData>>>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await apiFetch<MeData>("/api/v1/auth/me");
    } catch (err) {
      lastErr = err;
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
      const href = await resolveAppEntryPath(auth.me);
      navigate(href, { replace: true });
    } catch {
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
