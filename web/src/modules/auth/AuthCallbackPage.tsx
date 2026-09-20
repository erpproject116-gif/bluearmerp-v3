import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, apiNetworkErrorMessage, supabase } from "../../shared/api";
import { useAuth, type MeData } from "../../shared/auth-context";
import { resolvePostLoginPath } from "../../shared/authReturnTo";

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

function profileFromSession(session: { user: { email?: string; user_metadata?: Record<string, unknown> } }) {
  const email = session.user.email?.trim() ?? "";
  const meta = session.user.user_metadata ?? {};
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    email;
  return { email, fullName };
}

async function recordIntake(email: string, fullName: string) {
  if (!email) return;
  await apiFetch(
    "/api/v1/platform/intake",
    {
      method: "POST",
      body: JSON.stringify({ full_name: fullName, email }),
    },
    { silent: true },
  );
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

    const { email, fullName } = profileFromSession(data.session);
    void recordIntake(email, fullName);

    try {
      let me = await fetchMeWithRetry();
      if (!me.success && me.status === 403) {
        if (me.code === "ERR_TENANT_PENDING_APPROVAL") {
          navigate("/pending-approval", { replace: true });
          return;
        }
        navigate("/welcome", { replace: true });
        return;
      }

      if (!me.success && me.code === "ERR_TENANT_PENDING_APPROVAL") {
        navigate("/pending-approval", { replace: true });
        return;
      }

      if (!me.success) {
        navigate(
          `/signin?error=${encodeURIComponent(me.message ?? "Account not provisioned yet.")}`,
          { replace: true },
        );
        return;
      }

      await auth.refresh();
      const href = await resolvePostLoginPath(auth.me);
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
