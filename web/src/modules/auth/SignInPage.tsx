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
  hasValidLoginOtpTrust,
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
  const [enteringApp, setEnteringApp] = createSignal(false);
  /** Avoid sending a second OTP when AuthCallback already sent one. */
  const [otpSentThisVisit, setOtpSentThisVisit] = createSignal(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "idle") {
      setError("Your session ended after 20 minutes of inactivity. Please sign in again.");
    }
    const msg = params.get("error");
    if (msg) setError(decodeURIComponent(msg));

    if (params.get("step") === "verify") {
      const pending = (getPendingLoginOtpEmail() || params.get("email") || "").trim().toLowerCase();
      if (pending) {
        setEmail(pending);
        setPendingLoginOtpEmail(pending);
        setStep("verify");
        setInfo(`Check your inbox for a 6-digit code sent to ${pending}.`);
        // AuthCallback sets otp=0 (already sent). ProtectedRoute sets otp=1 (needs send).
        const alreadySent = params.get("otp") === "0";
        if (!alreadySent && !otpSentThisVisit()) {
          setOtpSentThisVisit(true);
          void supabase.auth
            .signInWithOtp({ email: pending, options: { shouldCreateUser: false } })
            .then(({ error: otpErr }) => {
              if (otpErr) setError(otpErr.message);
            });
        }
        // Clean noisy query params from the address bar.
        window.history.replaceState({}, document.title, "/signin?step=verify");
      }
    }
  });

  createEffect(() => {
    if (enteringApp()) return;
    const email = auth.me?.user.email;
    if (!auth.bootstrapping && auth.me && isLoginOtpVerified(email)) {
      setEnteringApp(true);
      void resolveAppEntryPath(auth.me).then((href) => navigate(href, { replace: true }));
    }
  });

  const sendLoginOtp = async (toEmail: string) => {
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: toEmail,
      options: { shouldCreateUser: false },
    });
    if (otpErr) throw otpErr;
    setOtpSentThisVisit(true);
  };

  const beginVerifyStep = async (toEmail: string, alreadySent = false) => {
    const normalized = toEmail.trim().toLowerCase();
    setPendingLoginOtpEmail(normalized);
    setEmail(normalized);
    if (!alreadySent) {
      await sendLoginOtp(normalized);
    }
    setInfo(`Check your inbox for a 6-digit code sent to ${normalized}.`);
    setCode("");
    setError(null);
    setStep("verify");
    window.history.replaceState({}, document.title, "/signin?step=verify");
  };

  const signInEmail = async (e: Event) => {
    e.preventDefault();
    if (!supabaseConfigured) {
      setError("Sign-in is not configured. Contact your administrator.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const toEmail = email().trim().toLowerCase();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: toEmail,
      password: password(),
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    // Already verified earlier today — skip the email code.
    if (hasValidLoginOtpTrust(toEmail)) {
      markLoginOtpVerified(toEmail);
      setEnteringApp(true);
      await auth.refresh();
      const href = await resolveAppEntryPath(auth.me);
      navigate(href, { replace: true });
      setLoading(false);
      return;
    }
    // Password OK — clear session, then send email code before entering the app.
    await supabase.auth.signOut();
    try {
      await beginVerifyStep(toEmail);
    } catch (otpErr) {
      setError(otpErr instanceof Error ? otpErr.message : "Could not send the verification code. Try again.");
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
      setError("We lost track of your email. Please sign in again.");
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
      setError(verifyErr.message || "That code did not work. Check the email and try again.");
      return;
    }
    markLoginOtpVerified(toEmail);
    setEnteringApp(true);
    try {
      await auth.refresh();
      const href = await resolveAppEntryPath(auth.me);
      navigate(href, { replace: true });
    } catch {
      setEnteringApp(false);
      setError("Code accepted, but we could not open your workspace. Click Verify again or refresh.");
    }
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
      setError(otpErr instanceof Error ? otpErr.message : "Could not resend the code. Wait a moment and try again.");
    }
    setLoading(false);
  };

  const backToSignIn = async () => {
    clearLoginOtpGate();
    setStep("credentials");
    setCode("");
    setInfo(null);
    setError(null);
    setOtpSentThisVisit(false);
    setEnteringApp(false);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    window.history.replaceState({}, document.title, "/signin");
  };

  const signInDemo = async () => {
    if (!supabaseConfigured) {
      setError("Sign-in is not configured.");
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
    markLoginOtpVerified(demoEmail);
    setEnteringApp(true);
    await auth.refresh();
    navigate("/app/inventory/partners", { replace: true });
    setLoading(false);
  };

  // Already verified and loading workspace
  if (enteringApp() || (auth.me && isLoginOtpVerified(auth.me.user.email) && !auth.bootstrapping)) {
    return <SessionLoading />;
  }

  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <AuthShell
        title={step() === "verify" ? "Check your email" : "Sign in"}
        subtitle={
          step() === "verify"
            ? "Enter the 6-digit code we sent to finish signing in."
            : "Use Google or your work email and password."
        }
        heroTitle={step() === "verify" ? "One more step for security." : undefined}
        heroBody={
          step() === "verify"
            ? "We email a short code after you sign in so only you can open your workspace—even if someone knows your password."
            : undefined
        }
        trustPoints={step() === "verify" ? [] : undefined}
        footer={
          step() === "verify" ? undefined : (
            <p class="mt-8 text-xs text-text-secondary">
              New to Bluearm?{" "}
              <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signup")}>
                Create an account
              </button>
            </p>
          )
        }
      >
        <Show when={step() === "credentials"}>
          <div class="mt-8 space-y-3">
            <GoogleAuthButton label="Continue with Google" disabled={loading()} onError={setError} />
            <p class="text-center text-xs text-text-secondary">
              After Google, we will email a verification code to confirm it is you.
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
            <span>or email and password</span>
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
              {loading() ? "Checking…" : "Continue"}
            </button>
            <p class="text-center text-xs text-text-secondary">
              Next: we email a 6-digit code to confirm your sign-in.
            </p>
          </form>

          <button
            type="button"
            class="mt-4 w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            disabled={loading()}
            onClick={() => navigate("/demo")}
          >
            Start a free demo workspace
          </button>

          <AuthAlert error={error()} />
        </Show>

        <Show when={step() === "verify"}>
          <div class="mt-8 space-y-4">
            <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              <p class="font-medium text-text-primary">Code sent</p>
              <p class="mt-1 text-text-secondary">
                {info() ?? "Open the email and type the 6-digit code below."}
              </p>
              <Show when={email()}>
                <p class="mt-2 font-mono text-xs text-text-primary">{email()}</p>
              </Show>
            </div>

            <AuthAlert error={error()} />

            <form class="space-y-4" onSubmit={(e) => void verifyCode(e)}>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autocomplete="one-time-code"
                  required
                  maxlength={6}
                  value={code()}
                  onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                  class={`${authInputClass} tracking-[0.35em]`}
                  placeholder="••••••"
                  autofocus
                />
              </div>
              <button
                type="submit"
                disabled={loading() || code().length < 6}
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading() ? "Verifying…" : "Verify and open workspace"}
              </button>
            </form>

            <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
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
                class="text-text-secondary hover:underline disabled:opacity-60"
                disabled={loading()}
                onClick={() => void backToSignIn()}
              >
                Use a different account
              </button>
            </div>

            <p class="text-xs leading-relaxed text-text-secondary">
              Tip: check Spam or Promotions if you do not see the email within a minute. After you verify once, we
              will not ask again until tomorrow.
            </p>
          </div>
        </Show>
      </AuthShell>
    </Show>
  );
}
