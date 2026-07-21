import { createEffect, createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { SessionLoading } from "../../shared/AuthRedirect";
import { resolveAppEntryPath } from "../../shared/resolveAppEntryPath";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";
import { GoogleAuthButton } from "./GoogleAuthButton";
import {
  clearLoginOtpGate,
  getPendingLoginOtpEmail,
  isLoginOtpVerified,
  markLoginOtpVerified,
  setPendingLoginOtpEmail,
} from "./loginOtpGate";

const demoSignInEnabled = import.meta.env.VITE_DEMO_SIGNIN_ENABLED === true;

type Step = "credentials" | "verify";

export default function SignInPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [step, setStep] = createSignal<Step>("credentials");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "idle") {
      setError("Your session ended after 20 minutes of inactivity. Please sign in again.");
    }
    const msg = params.get("error");
    if (msg) setError(decodeURIComponent(msg));
    if (params.get("step") === "verify") {
      const pending = getPendingLoginOtpEmail() || (params.get("email") ?? "").trim();
      if (pending) {
        setEmail(pending);
        setPendingLoginOtpEmail(pending);
        setStep("verify");
        setInfo(`We emailed a 6-digit code to ${pending}. Enter it below to finish signing in.`);
        // Ensure a code is sent when arriving from an existing session gate.
        void supabase.auth.signInWithOtp({ email: pending, options: { shouldCreateUser: false } }).then(({ error: otpErr }) => {
          if (otpErr) setError(otpErr.message);
        });
      }
    }
  });

  createEffect(() => {
    if (!auth.bootstrapping && auth.me && isLoginOtpVerified()) {
      void resolveAppEntryPath(auth.me).then((href) => navigate(href, { replace: true }));
    }
  });

  const sendLoginOtp = async (toEmail: string) => {
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: toEmail,
      options: { shouldCreateUser: false },
    });
    if (otpErr) throw otpErr;
  };

  const beginVerifyStep = async (toEmail: string) => {
    setPendingLoginOtpEmail(toEmail);
    await sendLoginOtp(toEmail);
    setInfo(`We emailed a 6-digit code to ${toEmail}. Enter it below to finish signing in.`);
    setStep("verify");
    setCode("");
  };

  const signInEmail = async (e: Event) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const toEmail = email().trim();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: toEmail,
      password: password(),
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    // Password OK — require email code before entering the app.
    await supabase.auth.signOut();
    try {
      await beginVerifyStep(toEmail);
    } catch (otpErr) {
      setError(otpErr instanceof Error ? otpErr.message : "Could not send verification code.");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const verifyCode = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const token = code().trim();
    if (token.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    const toEmail = (email().trim() || getPendingLoginOtpEmail()).toLowerCase();
    if (!toEmail) {
      setError("Missing email. Please sign in again.");
      setStep("credentials");
      return;
    }
    setLoading(true);
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: toEmail,
      token,
      type: "email",
    });
    if (verifyErr) {
      setLoading(false);
      setError(verifyErr.message);
      return;
    }
    markLoginOtpVerified();
    await auth.refresh();
    const href = await resolveAppEntryPath(auth.me);
    navigate(href, { replace: true });
    setLoading(false);
  };

  const resendCode = async () => {
    const toEmail = (email().trim() || getPendingLoginOtpEmail()).toLowerCase();
    if (!toEmail) return;
    setLoading(true);
    setError(null);
    try {
      await sendLoginOtp(toEmail);
      setInfo(`A new code was sent to ${toEmail}.`);
    } catch (otpErr) {
      setError(otpErr instanceof Error ? otpErr.message : "Could not resend code.");
    }
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
    markLoginOtpVerified();
    await auth.refresh();
    navigate("/app/inventory/partners", { replace: true });
    setLoading(false);
  };

  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={!auth.me || !isLoginOtpVerified()} fallback={<SessionLoading />}>
        <AuthShell
          title={step() === "verify" ? "Verify your email" : "Sign in"}
          subtitle={
            step() === "verify"
              ? "Enter the code we sent to confirm it’s you"
              : "Sign up or sign in — Google works for both"
          }
          footer={
            <p class="mt-8 text-xs text-text-secondary">
              New to Bluearm?{" "}
              <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signup")}>
                Create an account
              </button>
            </p>
          }
        >
          <Show when={step() === "credentials"}>
            <div class="mt-8 space-y-3">
              <GoogleAuthButton
                label="Sign up or continue with Google"
                disabled={loading()}
                onError={setError}
              />
              <p class="text-center text-xs text-text-secondary">
                New users get a 90-day trial workspace automatically. After Google, we email a verification code.
              </p>
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
                disabled={loading()}
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading() ? "Signing in…" : "Sign in with email"}
              </button>
            </form>

            <button
              type="button"
              class="mt-4 w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
              disabled={loading()}
              onClick={() => navigate("/demo")}
            >
              Start a free demo workspace
            </button>
          </Show>

          <Show when={step() === "verify"}>
            <form class="mt-8 space-y-4" onSubmit={(e) => void verifyCode(e)}>
              <p class="text-sm text-text-secondary">{info()}</p>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autocomplete="one-time-code"
                  required
                  maxlength={8}
                  value={code()}
                  onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, "").slice(0, 8))}
                  class={authInputClass}
                  placeholder="6-digit code"
                />
              </div>
              <button
                type="submit"
                disabled={loading()}
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading() ? "Verifying…" : "Verify and continue"}
              </button>
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  class="font-medium text-brand-600 hover:underline disabled:opacity-60"
                  disabled={loading()}
                  onClick={() => void resendCode()}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  class="text-text-secondary hover:underline"
                  disabled={loading()}
                  onClick={() => {
                    clearLoginOtpGate();
                    setStep("credentials");
                    setCode("");
                    setInfo(null);
                    setError(null);
                  }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          </Show>

          <AuthAlert error={error()} />
          <Show when={info() && step() === "credentials"}>
            <p class="mt-4 text-sm text-text-secondary">{info()}</p>
          </Show>

          <Show when={demoSignInEnabled}>
            <p class="mt-6 text-xs text-text-secondary">Demo tenant DEMO000 · Platform owners may use Google sign-in</p>
          </Show>
        </AuthShell>
      </Show>
    </Show>
  );
}
