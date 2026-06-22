import { createEffect, createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { SessionLoading } from "../../shared/AuthRedirect";

const demoSignInEnabled = import.meta.env.VITE_DEMO_SIGNIN_ENABLED === true;

export default function SignInPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    const msg = new URLSearchParams(window.location.search).get("error");
    if (msg) setError(decodeURIComponent(msg));
  });

  createEffect(() => {
    if (!auth.loading && auth.me) {
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

  const signInDemo = async () => {
    if (!supabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    const email = import.meta.env.VITE_DEMO_USER_EMAIL ?? "demo@demo.bluearm.local";
    const password = import.meta.env.VITE_DEMO_USER_PASSWORD ?? "DemoBluearm2026!";
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
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
    <Show when={!auth.loading} fallback={<SessionLoading />}>
      <Show when={!auth.me} fallback={<SessionLoading />}>
        <div class="flex min-h-screen bg-body">
      <div class="hidden w-1/2 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">B</div>
          <span class="text-2xl font-semibold">Bluearm ERP</span>
        </div>
        <div>
          <h2 class="text-3xl font-semibold leading-tight">Modular inventory master data</h2>
          <p class="mt-4 max-w-md text-brand-100">
            Spreadsheet-style grids, tenant-scoped codes, and enterprise-ready modules — styled with TailAdmin.
          </p>
        </div>
        <p class="text-sm text-brand-100">© Bluearm Philippines</p>
      </div>

      <div class="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div class="mx-auto w-full max-w-md">
          <div class="mb-8 lg:hidden">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
              B
            </div>
          </div>
          <h1 class="text-2xl font-semibold text-text-primary">Sign in</h1>
          <p class="mt-2 text-sm text-text-secondary">Continue to your inventory workspace</p>

          <div class="mt-8 space-y-3">
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
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
                disabled={loading()}
                onClick={() => void signInDemo()}
              >
                Try free demo
              </button>
            </Show>
          </div>

          <Show when={error()}>
            <p class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error()}</p>
          </Show>

          <Show when={demoSignInEnabled}>
            <p class="mt-8 text-xs text-text-secondary">
              Demo tenant DEMO000 · Platform owners use Google sign-in
            </p>
          </Show>
        </div>
      </div>
        </div>
      </Show>
    </Show>
  );
}
