import { Show, createSignal, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, supabase } from "../../shared/api";
import { useAuth, type MeData } from "../../shared/auth-context";
import { resolvePostLoginPath } from "../../shared/authReturnTo";
import { endRolePreviewSession } from "../../shared/endRolePreviewSession";
import { rolePreviewBootstrapMessage } from "../../shared/rolePreviewClient";

async function fetchMeOnce(): Promise<Awaited<ReturnType<typeof apiFetch<MeData>>>> {
  try {
    return await apiFetch<MeData>("/api/v1/auth/me", {}, { silent: true });
  } catch {
    return {
      success: false,
      status: 0,
      ok: false,
      message: "Network error talking to the API.",
      code: "ERR_NETWORK",
    };
  }
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
    { silent: true, background: true },
  );
}

type Phase = "working" | "recover";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [phase, setPhase] = createSignal<Phase>("working");
  const [status, setStatus] = createSignal("Completing sign-in…");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const finishWithMe = async () => {
    await auth.refresh();
    if (!auth.me) {
      throw new Error("Session loaded but /auth/me is still empty.");
    }
    const href = await resolvePostLoginPath(auth.me);
    navigate(href, { replace: true });
  };

  const loadSessionAfterOAuth = async () => {
    setPhase("working");
    setError(null);
    setStatus("Completing sign-in…");

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") ?? params.get("error");
    if (oauthError) {
      navigate(`/signin?error=${encodeURIComponent(oauthError)}`, { replace: true });
      return;
    }

    // Prefer an already-exchanged session (retry / Exit) before requiring ?code=.
    let session = (await supabase.auth.getSession()).data.session;
    const code = params.get("code");
    if (!session && code) {
      setStatus("Exchanging Google sign-in…");
      const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr || !data.session) {
        navigate(
          `/signin?error=${encodeURIComponent(exErr?.message ?? "Sign-in failed. Try again.")}`,
          { replace: true },
        );
        return;
      }
      session = data.session;
    }
    if (!session) {
      navigate(`/signin?error=${encodeURIComponent("Missing OAuth session. Sign in again.")}`, {
        replace: true,
      });
      return;
    }

    window.history.replaceState({}, document.title, "/auth/callback");
    const { email, fullName } = profileFromSession(session);

    setStatus("Loading your workspace…");
    let me = await fetchMeOnce();

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
      setStatus("Clearing role preview (if any)…");
      await endRolePreviewSession();
      me = await fetchMeOnce();
    }

    if (!me.success) {
      setError(
        rolePreviewBootstrapMessage(
          me.message ||
            "The API did not return your session. This is often a brief 502 during API restart — not always a CORS_ORIGIN misconfiguration.",
        ),
      );
      setPhase("recover");
      return;
    }

    void recordIntake(email, fullName);
    setStatus("Opening app…");
    try {
      await finishWithMe();
    } catch (e) {
      setError(
        rolePreviewBootstrapMessage(
          e instanceof Error ? e.message : "Could not finish loading your session after sign-in.",
        ),
      );
      setPhase("recover");
    }
  };

  const exitPreviewAndRetry = async () => {
    if (busy()) return;
    setBusy(true);
    setPhase("working");
    setStatus("Exiting role preview…");
    setError(null);
    try {
      await endRolePreviewSession();
      setStatus("Retrying session…");
      const me = await fetchMeOnce();
      if (me.success) {
        await finishWithMe();
        return;
      }
      setError(
        rolePreviewBootstrapMessage(
          me.message || "Still cannot load /auth/me. Retry, or go to Sign in.",
        ),
      );
      setPhase("recover");
    } catch (e) {
      setError(
        rolePreviewBootstrapMessage(e instanceof Error ? e.message : "Recovery failed."),
      );
      setPhase("recover");
    } finally {
      setBusy(false);
    }
  };

  onMount(() => {
    void loadSessionAfterOAuth().catch((e) => {
      setError(
        rolePreviewBootstrapMessage(e instanceof Error ? e.message : "Sign-in callback failed."),
      );
      setPhase("recover");
    });
  });

  return (
    <div class="flex min-h-screen items-center justify-center bg-body p-6">
      <div class="w-full max-w-lg rounded-xl border border-stroke bg-white p-6 shadow-sm">
        <Show
          when={phase() === "recover"}
          fallback={
            <div class="text-center">
              <div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <p class="text-sm text-text-secondary">{status()}</p>
            </div>
          }
        >
          <p class="text-sm font-medium text-text-primary">Sign-in could not finish</p>
          <p class="mt-2 text-sm text-text-secondary">{error()}</p>
          <p class="mt-2 text-xs text-text-secondary">
            You are on /auth/callback. Use Exit role preview if View as role was active — then Retry. A console CORS
            line with 502 usually means the API was briefly unreachable, not a wrong CORS_ORIGIN.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={busy()}
              onClick={() => void exitPreviewAndRetry()}
            >
              {busy() ? "Working…" : "Exit role preview & retry"}
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50 disabled:opacity-50"
              disabled={busy()}
              onClick={() => void loadSessionAfterOAuth()}
            >
              Retry
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              disabled={busy()}
              onClick={() => navigate("/signin?recover_preview=1", { replace: true })}
            >
              Go to Sign in
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
