import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getAccessToken } from "../../shared/api";
import { setActiveTenantId } from "../../shared/activeContext";
import { useAuth } from "../../shared/auth-context";
import { resolveAppEntryPath } from "../../shared/resolveAppEntryPath";
import { AuthAlert, AuthShell } from "./AuthShell";

const apiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");

type OnboardingStatus = {
  pending_invite?: {
    tenant_id?: number;
    company_code?: string;
    company_name?: string;
  } | null;
  pending_approval?: { tenant_id?: number; company_code?: string } | null;
  email_occupancy?: {
    occupied?: boolean;
    company_name?: string;
    company_code?: string;
    tenant_id?: number;
  } | null;
};

export default function WelcomePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(false);
  const [joining, setJoining] = createSignal(false);
  const [statusLoading, setStatusLoading] = createSignal(true);
  const [inviteCode, setInviteCode] = createSignal<string | null>(null);
  const [inviteName, setInviteName] = createSignal<string | null>(null);
  const [emailOccupied, setEmailOccupied] = createSignal(false);
  const [occupiedCompany, setOccupiedCompany] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    void (async () => {
      setStatusLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          navigate("/signin", { replace: true });
          return;
        }
        await auth.refresh();
        if (auth.me) {
          const href = await resolveAppEntryPath(auth.me);
          navigate(href, { replace: true });
          return;
        }
        const res = await fetch(`${apiBase}/api/v1/platform/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json()) as { success?: boolean; data?: OnboardingStatus };
        if (!res.ok || !body.success || !body.data) {
          return;
        }
        if (body.data.pending_approval) {
          navigate("/pending-approval", { replace: true });
          return;
        }
        if (body.data.pending_invite?.company_code) {
          setInviteCode(body.data.pending_invite.company_code);
          setInviteName(body.data.pending_invite.company_name ?? null);
        } else if (body.data.email_occupancy?.occupied) {
          setEmailOccupied(true);
          setOccupiedCompany(body.data.email_occupancy.company_name ?? body.data.email_occupancy.company_code ?? null);
        }
      } catch {
        // Keep default Welcome layout if status probe fails.
      } finally {
        setStatusLoading(false);
      }
    })();
  });

  const companyLabel = () => {
    const name = inviteName()?.trim();
    const code = inviteCode();
    if (name && code) return `${name} (${code})`;
    if (name) return name;
    if (code) return code;
    return null;
  };

  const retryInviteJoin = async () => {
    setError(null);
    setJoining(true);
    try {
      await auth.refresh();
      if (auth.me) {
        try {
          sessionStorage.setItem(
            `erp.joinedCompany:${auth.me.tenant.id}:${auth.me.user.id}`,
            auth.me.tenant.company_name || "1",
          );
        } catch {
          /* ignore */
        }
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      setError(
        hasInvite()
          ? "Could not join yet. Ask your admin to confirm this exact Google email is invited, then try again."
          : "No company invite found for this Google account. Ask your admin to invite this exact email, or start your own business below with this email only if it is not already used on another company.",
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
        data?: {
          tenant_id?: number;
          joined_invite?: boolean;
          pending_approval?: boolean;
          company_name?: string;
        };
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
        if (auth.me) {
          try {
            sessionStorage.setItem(
              `erp.joinedCompany:${auth.me.tenant.id}:${auth.me.user.id}`,
              auth.me.tenant.company_name || body.data.company_name || "1",
            );
          } catch {
            /* ignore */
          }
        }
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      if (body.data?.pending_approval) {
        navigate("/pending-approval", { replace: true });
        return;
      }
      if (auth.me) {
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      navigate("/app/setup", { replace: true });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasInvite = () => Boolean(inviteCode());
  const blockedOwnBusiness = () => emailOccupied() && !hasInvite();

  return (
    <AuthShell
      title={hasInvite() ? "Join your company" : "Choose how to start"}
      subtitle={
        hasInvite()
          ? `You have a pending invite${companyLabel() ? ` for ${companyLabel()}` : ""}.`
          : "Join your company if you were invited, or start your own workspace with an unused email."
      }
      heroTitle={hasInvite() ? "You're invited." : "You're signed in. Choose how to begin."}
      heroBody={
        hasInvite()
          ? "This Google email can only join this company as a team member. To open your own business, sign up with a different Google email."
          : "One email belongs to one customer business. If an admin invited you, join with that exact email. To create your own company, use an email that is not already invited or linked elsewhere."
      }
      trustPoints={
        hasInvite()
          ? [
              "Join as a team member — not a new company owner",
              "One email → one customer business",
              "Own business needs a different Google email",
            ]
          : [
              "Own business: start trial — workspace is created immediately, no waiting on Bluearm",
              "Next: setup wizard → Day 1 stock → onboarding playbook",
              "Invited members: use the exact Google email your admin invited",
            ]
      }
    >
      <div class="mt-8 space-y-4">
        <Show when={statusLoading()}>
          <p class="text-sm text-text-secondary">Checking for company invites…</p>
        </Show>
        <Show when={!statusLoading()}>
          <button
            type="button"
            disabled={joining() || loading()}
            class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            onClick={() => void retryInviteJoin()}
          >
            {joining()
              ? "Joining…"
              : hasInvite()
                ? `Join ${companyLabel() ?? "company"}`
                : "I was invited — join my company"}
          </button>
          <p class="text-xs text-text-secondary">
            {hasInvite()
              ? "Uses your signed-in Google email. You enter that workspace as a member."
              : "Uses your signed-in Google email. If an invite is ready, you enter that workspace as a member."}
          </p>

          <Show when={!hasInvite() && !blockedOwnBusiness()}>
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
              {loading() ? "Setting up your workspace…" : "Start 14-day free trial"}
            </button>
            <p class="text-xs text-text-secondary">
              Creates your company workspace right away — then setup wizard, Day 1 stock, and the playbook. No credit
              card for the trial. Buying and selling unlock after Day 1 plus GCash payment confirmed by Bluearm (not
              instant). Use an email not already on another Bluearm company.
            </p>

            <button
              type="button"
              class="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm font-medium text-text-primary hover:bg-slate-50"
              onClick={() => navigate("/demo")}
            >
              Start a free demo (sample data, ~14 days)
            </button>
          </Show>

          <Show when={blockedOwnBusiness()}>
            <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This Google email already belongs to{" "}
              <strong class="font-medium">{occupiedCompany() ?? "another company"}</strong>. To open your own
              business, sign out and sign in with a different Google email.
            </p>
          </Show>

          <Show when={hasInvite()}>
            <p class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
              Need your own business instead? Sign out and create an account with a{" "}
              <strong class="font-medium text-text-primary">different</strong> Google email.
            </p>
          </Show>
        </Show>

        <Show when={error()}>
          <AuthAlert error={error()} />
        </Show>
      </div>
    </AuthShell>
  );
}
