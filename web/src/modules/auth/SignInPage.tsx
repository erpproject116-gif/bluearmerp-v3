import { createEffect, createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { SessionLoading } from "../../shared/AuthRedirect";
import { resolvePostLoginPath, stashNextFromSearch } from "../../shared/authReturnTo";
import { endRolePreviewSession } from "../../shared/endRolePreviewSession";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";
import { GoogleAuthButton } from "./GoogleAuthButton";

const demoSignInEnabled = import.meta.env.VITE_DEMO_SIGNIN_ENABLED === true;

export default function SignInPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [endingPreview, setEndingPreview] = createSignal(false);
  const [showPreviewExit, setShowPreviewExit] = createSignal(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    stashNextFromSearch(window.location.search);
    if (params.get("reason") === "idle") {
      setError("Your session ended after 20 minutes of inactivity. Please sign in again.");
    }
    const msg = params.get("error");
    if (msg) setError(decodeURIComponent(msg));
    if (
      params.get("recover_preview") === "1" ||
      (msg && /role preview|CORS|Could not reach|API/i.test(decodeURIComponent(msg)))
    ) {
      setShowPreviewExit(true);
    }
  });

  createEffect(() => {
    if (!auth.bootstrapping && auth.me) {
      void resolvePostLoginPath(auth.me).then((href) => navigate(href, { replace: true }));
    }
  });

  const exitRolePreview = async () => {
    if (endingPreview()) return;
    setEndingPreview(true);
    setError(null);
    try {
      await endRolePreviewSession();
      await auth.refresh();
      if (auth.me) {
        const href = await resolvePostLoginPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      setError("Role preview cleared. Sign in again, or use Google / email below.");
      setShowPreviewExit(false);
    } catch {
      setError("Could not clear role preview. Hard-refresh (Ctrl+Shift+R) and try Exit again.");
    } finally {
      setEndingPreview(false);
    }
  };

  const signInEmail = async (e: Event) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email().trim(),
      password: password(),
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    await auth.refresh();
    const href = await resolvePostLoginPath(auth.me);
    navigate(href, { replace: true });
    setLoading(false);
  };

  const signInDemo = async () => {
    if (!supabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    const demoEmail = import.meta.env.VITE_DEMO_USER_EMAIL ?? "demo@demo.bluearm.local";
    const demoPassword = import.meta.env.VITE_DEMO_USER_PASSWORD ?? "DemoBluearm2026!";
    const { error: err } = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    await auth.refresh();
    navigate("/app/inventory/partners", { replace: true });
    setLoading(false);
  };

  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={!auth.me} fallback={<SessionLoading />}>
        <AuthShell
          title="Sign in"
          subtitle="Sign in with Google or email — invited members join their company workspace"
          footer={
            <p class="mt-8 text-xs text-text-secondary">
              New to Bluearm?{" "}
              <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signup")}>
                Create an account
              </button>
            </p>
          }
        >
          <div class="mt-8 space-y-3">
            <GoogleAuthButton
              label="Sign up or continue with Google"
              disabled={loading() || endingPreview()}
              onError={setError}
            />
            <p class="text-center text-xs text-text-secondary">
              Invited by your company? Sign in with that exact Google email. One email belongs to one customer business —
              to open your own company, use a different email.
            </p>
            <Show when={demoSignInEnabled}>
              <button
                type="button"
                class="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm font-medium text-text-primary shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                disabled={loading() || endingPreview()}
                onClick={() => void signInDemo()}
              >
                Try free demo (quick sign-in)
              </button>
            </Show>
          </div>

          <div class="mt-6 flex items-center gap-3 text-xs text-text-secondary">
            <span class="h-px flex-1 bg-stroke" />
            <span>or sign in with email</span>
            <span class="h-px flex-1 bg-stroke" />
          </div>

          <form class="mt-4 space-y-4" onSubmit={(e) => void signInEmail(e)}>
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Email</label>
              <input
                type="email"
                required
                autocomplete="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class={authInputClass}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm font-medium text-text-primary">Password</label>
                <button
                  type="button"
                  class="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class={authInputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading() || endingPreview()}
              class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading() ? "Signing in…" : "Sign in with email"}
            </button>
          </form>

          <button
            type="button"
            class="mt-4 w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            disabled={loading() || endingPreview()}
            onClick={() => navigate("/demo")}
          >
            Start a free demo workspace
          </button>

          <AuthAlert error={error()} />

          <Show when={showPreviewExit() || Boolean(error())}>
            <button
              type="button"
              class="mt-3 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
              disabled={endingPreview() || loading()}
              onClick={() => void exitRolePreview()}
            >
              {endingPreview() ? "Exiting role preview…" : "Exit role preview"}
            </button>
            <p class="mt-2 text-center text-xs text-text-secondary">
              Safe if you were not previewing — clears sticky View-as-role state, then retry sign-in.
            </p>
          </Show>

          <Show when={demoSignInEnabled}>
            <p class="mt-6 text-xs text-text-secondary">Demo tenant DEMO000 · Platform owners may use Google sign-in</p>
          </Show>
        </AuthShell>
      </Show>
    </Show>
  );
}
