import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, supabase } from "../../shared/api";
import { setActiveTenantId } from "../../shared/activeContext";
import { useAuth, type MeData } from "../../shared/auth-context";

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

    // Demo users who verify via a magic link (rather than the /demo OTP form) land
    // here with a session but no tenant yet. If there is a pending demo signup for
    // this email, provision their workspace so the link "just works". This is a
    // no-op (400) for regular OAuth users with no signup, preserving existing flow.
    const me = await apiFetch<MeData>("/api/v1/auth/me", {}, { silent: true });
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
    navigate("/app/inventory/partners", { replace: true });
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
