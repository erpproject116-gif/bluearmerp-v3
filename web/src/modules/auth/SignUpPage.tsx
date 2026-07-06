import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";
import { authRedirectUrl } from "./authRedirect";

export default function SignUpPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [fullName, setFullName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);
  const [done, setDone] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!supabaseConfigured) {
      setError("Sign-up is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const trimmedEmail = email().trim();
    const pwd = password();
    if (pwd.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pwd !== confirmPassword()) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: pwd,
      options: {
        data: { full_name: fullName().trim() },
        emailRedirectTo: authRedirectUrl("/auth/callback"),
      },
    });
    setLoading(false);

    if (signUpErr) {
      setError(signUpErr.message);
      return;
    }

    const apiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");
    void fetch(`${apiBase}/api/v1/platform/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName().trim(),
        email: trimmedEmail,
      }),
    });

    if (data.session) {
      await auth.refresh();
      if (auth.me) {
        navigate("/app/dashboard", { replace: true });
      } else {
        navigate("/welcome", { replace: true });
      }
      return;
    }

    setDone(true);
    setInfo(
      `We sent a confirmation link to ${trimmedEmail}. Open it to activate your account, then sign in. If you were invited by your company admin, use the same email they invited.`,
    );
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with email and password. Your admin can invite you to a company workspace afterward."
      heroTitle="Get started with Bluearm"
      heroBody="Create a personal login, then join your company workspace when an administrator invites you — or start a free demo to explore on your own."
      footer={
        <p class="mt-8 text-xs text-text-secondary">
          Already have an account?{" "}
          <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signin")}>
            Sign in
          </button>
        </p>
      }
    >
      <Show
        when={!done()}
        fallback={
          <div class="mt-8 space-y-4">
            <AuthAlert info={info()} />
            <button
              type="button"
              class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => navigate("/signin")}
            >
              Go to sign in
            </button>
          </div>
        }
      >
        <form class="mt-8 space-y-4" onSubmit={(e) => void submit(e)}>
          <div>
            <label class="mb-1 block text-sm font-medium text-text-primary">Full name</label>
            <input
              type="text"
              required
              autocomplete="name"
              value={fullName()}
              onInput={(e) => setFullName(e.currentTarget.value)}
              class={authInputClass}
              placeholder="Juan dela Cruz"
            />
          </div>
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
            <label class="mb-1 block text-sm font-medium text-text-primary">Password</label>
            <input
              type="password"
              required
              autocomplete="new-password"
              minLength={8}
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              class={authInputClass}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-text-primary">Confirm password</label>
            <input
              type="password"
              required
              autocomplete="new-password"
              minLength={8}
              value={confirmPassword()}
              onInput={(e) => setConfirmPassword(e.currentTarget.value)}
              class={authInputClass}
            />
          </div>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading() ? "Creating account…" : "Create account"}
          </button>
        </form>
      </Show>

      <AuthAlert error={error()} info={done() ? null : info()} />

      <div class="mt-6 flex items-center gap-3 text-xs text-text-secondary">
        <span class="h-px flex-1 bg-stroke" />
        <span>or</span>
        <span class="h-px flex-1 bg-stroke" />
      </div>
      <button
        type="button"
        class="mt-4 w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100"
        onClick={() => navigate("/demo")}
      >
        Start a free demo instead
      </button>
    </AuthShell>
  );
}
