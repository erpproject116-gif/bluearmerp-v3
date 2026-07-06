import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";
import { authRedirectUrl } from "./authRedirect";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);
  const [sent, setSent] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!supabaseConfigured) {
      setError("Password reset is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const trimmedEmail = email().trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: authRedirectUrl("/auth/reset-password"),
    });
    setLoading(false);

    if (resetErr) {
      setError(resetErr.message);
      return;
    }

    setSent(true);
    setInfo(`If an account exists for ${trimmedEmail}, we sent a password reset link. Check your inbox and spam folder.`);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email for your account. We'll send a link to choose a new password."
      heroTitle="Forgot your password?"
      heroBody="We'll email you a secure link to set a new password. The link expires after a short time for your security."
      footer={
        <p class="mt-8 text-xs text-text-secondary">
          Remember your password?{" "}
          <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signin")}>
            Back to sign in
          </button>
        </p>
      }
    >
      <Show
        when={!sent()}
        fallback={
          <div class="mt-8 space-y-4">
            <AuthAlert info={info()} />
            <button
              type="button"
              class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => navigate("/signin")}
            >
              Return to sign in
            </button>
          </div>
        }
      >
        <form class="mt-8 space-y-4" onSubmit={(e) => void submit(e)}>
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
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading() ? "Sending link…" : "Send reset link"}
          </button>
        </form>
      </Show>

      <AuthAlert error={error()} />
    </AuthShell>
  );
}
