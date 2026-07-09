import { createEffect, createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { SessionLoading } from "../../shared/AuthRedirect";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";

const demoSignInEnabled = import.meta.env.VITE_DEMO_SIGNIN_ENABLED === true;

export default function SignInPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "idle") {
      setError("Your session ended after 20 minutes of inactivity. Please sign in again.");
    }
    const msg = params.get("error");
    if (msg) setError(decodeURIComponent(msg));
  });

  createEffect(() => {
    if (!auth.bootstrapping && auth.me) {
      navigate("/app/inventory/partners", { replace: true });
    }
  });

  const signInGoogle = async () => {
    if (!supabaseConfigured) {
      setError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in web/.env.local");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (err) setError(err.message);
    setLoading(false);
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
    navigate("/app/inventory/partners", { replace: true });
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
          subtitle="Continue to your inventory workspace"
          footer={
            <p class="mt-8 text-xs text-text-secondary">
              New to Bluearm?{" "}
              <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signup")}>
                Create an account
              </button>
            </p>
          }
        >
          <form class="mt-8 space-y-4" onSubmit={(e) => void signInEmail(e)}>
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
              disabled={loading()}
              class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading() ? "Signing in…" : "Sign in with email"}
            </button>
          </form>

          <div class="mt-6 flex items-center gap-3 text-xs text-text-secondary">
            <span class="h-px flex-1 bg-stroke" />
            <span>or continue with</span>
            <span class="h-px flex-1 bg-stroke" />
          </div>

          <div class="mt-4 space-y-3">
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-stroke bg-white px-4 py-3 text-sm font-medium text-text-primary shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              disabled={loading()}
              onClick={() => void signInGoogle()}
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
            <Show when={demoSignInEnabled}>
              <button
                type="button"
                class="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm font-medium text-text-primary shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                disabled={loading()}
                onClick={() => void signInDemo()}
              >
                Try free demo (quick sign-in)
              </button>
            </Show>
          </div>

          <button
            type="button"
            class="mt-4 w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            disabled={loading()}
            onClick={() => navigate("/demo")}
          >
            Start a free demo workspace
          </button>

          <AuthAlert error={error()} />

          <Show when={demoSignInEnabled}>
            <p class="mt-6 text-xs text-text-secondary">Demo tenant DEMO000 · Platform owners may use Google sign-in</p>
          </Show>
        </AuthShell>
      </Show>
    </Show>
  );
}
