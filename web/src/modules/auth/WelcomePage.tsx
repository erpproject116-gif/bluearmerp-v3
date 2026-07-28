import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getAccessToken } from "../../shared/api";
import { setActiveTenantId } from "../../shared/activeContext";
import { useAuth } from "../../shared/auth-context";
import { resolveAppEntryPath } from "../../shared/resolveAppEntryPath";
import { AuthAlert, AuthShell } from "./AuthShell";

const apiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");

export default function WelcomePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(false);
  const [joining, setJoining] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const retryInviteJoin = async () => {
    setError(null);
    setJoining(true);
    try {
      await auth.refresh();
      if (auth.me) {
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      setError(
        "No company invite found for this Google account yet. Ask your admin to invite this exact email, then try again—or start a trial below if you are opening your own company.",
      );
    } finally {
      setJoining(false);
    }
  };

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
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: { tenant_id?: number; joined_invite?: boolean; pending_approval?: boolean };
      };
      if (!res.ok || !body.success) {
        setError(body.message ?? "Could not start trial. Try again or contact support.");
        return;
      }
      if (body.data?.tenant_id) {
        setActiveTenantId(body.data.tenant_id);
      }
      await auth.refresh();
      if (body.data?.joined_invite) {
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      if (body.data?.pending_approval) {
        navigate("/pending-approval", { replace: true });
        return;
      }
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
      subtitle="Join your company if you were invited, or start your own workspace."
      heroTitle="You're signed in. Choose how to begin."
      heroBody="If your admin invited you, join that company first. Starting a trial creates a separate company workspace—only do that when you are opening your own business."
      trustPoints={[
        "Invited members: use the same Google email your admin invited",
        "Trial is optional and explicit—never started automatically",
        "Your data stays in an isolated, tenant-scoped workspace",
      ]}
    >
      <div class="mt-8 space-y-4">
        <button
          type="button"
          disabled={joining() || loading()}
          class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          onClick={() => void retryInviteJoin()}
        >
          {joining() ? "Checking invite…" : "I was invited — join my company"}
        </button>
        <p class="text-xs text-text-secondary">
          Uses your signed-in Google email. If the invite is ready, you enter that workspace as a member (not a new owner).
        </p>

        <div class="flex items-center gap-3 text-xs text-text-secondary">
          <span class="h-px flex-1 bg-stroke" />
          <span>or start your own company</span>
          <span class="h-px flex-1 bg-stroke" />
        </div>

        <button
          type="button"
          disabled={loading() || joining()}
          class="w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          onClick={() => void startTrial()}
        >
          {loading() ? "Setting up your workspace…" : "Start 90-day free trial"}
        </button>
        <p class="text-xs text-text-secondary">
          Empty workspace for real data. No credit card required. If you still have a pending invite, this joins that company instead of creating a second workspace.
        </p>

        <button
          type="button"
          class="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm font-medium text-text-primary hover:bg-slate-50"
          onClick={() => navigate("/demo")}
        >
          Start a free demo (sample data, ~14 days)
        </button>

        <Show when={error()}>
          <AuthAlert error={error()} />
        </Show>
      </div>
    </AuthShell>
  );
}
