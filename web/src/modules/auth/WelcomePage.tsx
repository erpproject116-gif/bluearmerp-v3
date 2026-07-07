import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getAccessToken } from "../../shared/api";
import { useAuth } from "../../shared/auth-context";
import { AuthAlert, AuthShell } from "../auth/AuthShell";

const apiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");

export default function WelcomePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const startTrial = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        navigate("/signin", { replace: true });
        return;
      }
      const res = await fetch(`${apiBase}/api/v1/platform/trial/provision`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const body = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !body.success) {
        setError(body.message ?? "Could not start trial. Try again or contact support.");
        return;
      }
      await auth.refresh();
      navigate("/app/setup", { replace: true });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose how to start"
      subtitle="Your account is ready. Pick a path below."
      heroTitle="You're in. Choose how to begin."
      heroBody="Pick the path that fits today—a guided demo with sample data, or a full trial workspace ready for your real operations."
      trustPoints={[
        "No credit card required for the 90-day trial",
        "Your data stays in an isolated, tenant-scoped workspace",
        "Upgrade to a paid plan only when you're ready",
      ]}
    >
      <div class="mt-8 space-y-4">
        <button
          type="button"
          disabled={loading()}
          class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          onClick={() => void startTrial()}
        >
          {loading() ? "Setting up your workspace…" : "Start 90-day free trial"}
        </button>
        <p class="text-xs text-text-secondary">
          Empty workspace for real data. No credit card required for the trial period.
        </p>

        <div class="flex items-center gap-3 text-xs text-text-secondary">
          <span class="h-px flex-1 bg-stroke" />
          <span>or</span>
          <span class="h-px flex-1 bg-stroke" />
        </div>

        <button
          type="button"
          class="w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-100"
          onClick={() => navigate("/demo")}
        >
          Start a free demo (sample data, ~14 days)
        </button>

        <Show when={error()}>
          <AuthAlert error={error()} />
        </Show>

        <p class="pt-4 text-xs text-text-secondary">
          Were you invited by your company admin?{" "}
          <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => void auth.refresh()}>
            Retry after invite
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
