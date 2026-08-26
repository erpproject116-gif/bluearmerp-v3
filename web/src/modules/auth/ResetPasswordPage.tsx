import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase, supabaseConfigured } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { AuthAlert, AuthShell, authInputClass } from "./AuthShell";

type OtpType = "recovery" | "invite" | "signup" | "magiclink" | "email";

function normalizeOtpType(raw: string | null): OtpType {
  const t = (raw ?? "recovery").toLowerCase();
  if (t === "invite" || t === "signup" || t === "magiclink" || t === "email" || t === "recovery") {
    return t;
  }
  return "recovery";
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [bootstrapping, setBootstrapping] = createSignal(true);
  const [sessionReady, setSessionReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);

  onMount(async () => {
    if (!supabaseConfigured) {
      setBootstrapping(false);
      setError("Password reset is not configured.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") ?? params.get("error");
    if (oauthError) {
      setBootstrapping(false);
      setError(decodeURIComponent(oauthError));
      return;
    }

    // Admin re-invite / generate_link deep link (no current password required).
    const tokenHash = params.get("token_hash");
    const otpType = normalizeOtpType(params.get("type"));
    if (tokenHash) {
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (otpErr) {
        setBootstrapping(false);
        setError(otpErr.message);
        return;
      }
      window.history.replaceState({}, document.title, "/auth/reset-password");
      setBootstrapping(false);
      setSessionReady(true);
      return;
    }

    const code = params.get("code");
    if (code) {
      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeErr) {
        setBootstrapping(false);
        setError(exchangeErr.message);
        return;
      }
      window.history.replaceState({}, document.title, "/auth/reset-password");
    }

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");
      if (accessToken && refreshToken && (type === "recovery" || type === "invite")) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionErr) {
          setBootstrapping(false);
          setError(sessionErr.message);
          return;
        }
        window.history.replaceState({}, document.title, "/auth/reset-password");
      }
    }

    const { data } = await supabase.auth.getSession();
    setBootstrapping(false);
    if (data.session) {
      setSessionReady(true);
      return;
    }

    setError("This reset link is invalid or has expired. Ask your admin to re-invite you, or request a new link.");
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

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
    // Recovery/invite session from the email link — never ask for the old password here.
    const { error: updateErr } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);

    if (updateErr) {
      const msg = updateErr.message || "Could not update password.";
      if (/current.?password|reauth|re-auth|recent.?login/i.test(msg)) {
        setError(
          "Your auth project requires the current password for changes. Disable “Require current password when changing password” in Supabase Auth settings for admin re-invite links, or open a fresh Set password link from your email.",
        );
        return;
      }
      setError(msg);
      return;
    }

    setInfo("Password updated. Signing you in…");
    await auth.refresh();
    navigate("/app/inventory/partners", { replace: true });
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter and confirm your new password. You do not need your old password."
      heroTitle="Set a password you can rely on."
      heroBody="Choose something unique and at least eight characters. You'll return to your workspace as soon as it's saved."
      trustPoints={[
        "Passwords are never stored in readable form",
        "Active sessions stay protected after you update",
        "Need help? Contact your company admin or Bluearm support",
      ]}
      footer={
        <p class="mt-8 text-xs text-text-secondary">
          <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signin")}>
            Back to sign in
          </button>
        </p>
      }
    >
      <Show
        when={!bootstrapping()}
        fallback={
          <div class="mt-10 flex flex-col items-center text-center">
            <div class="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <p class="text-sm text-text-secondary">Verifying reset link…</p>
          </div>
        }
      >
        <Show
          when={sessionReady()}
          fallback={
            <div class="mt-8 space-y-4">
              <AuthAlert error={error()} />
              <button
                type="button"
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
                onClick={() => navigate("/forgot-password")}
              >
                Request a new reset link
              </button>
            </div>
          }
        >
          <form class="mt-8 space-y-4" onSubmit={(e) => void submit(e)}>
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">New password</label>
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
              <label class="mb-1 block text-sm font-medium text-text-primary">Confirm new password</label>
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
              {loading() ? "Saving…" : "Update password"}
            </button>
          </form>
          <AuthAlert error={error()} info={info()} />
        </Show>
      </Show>
    </AuthShell>
  );
}
