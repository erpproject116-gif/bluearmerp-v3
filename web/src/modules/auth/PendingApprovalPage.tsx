import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "../../shared/auth-context";
import { resolveAppEntryPath } from "../../shared/resolveAppEntryPath";
import { AuthAlert, AuthShell } from "./AuthShell";

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [checking, setChecking] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const checkAgain = async () => {
    setError(null);
    setChecking(true);
    try {
      await auth.refresh();
      if (auth.me) {
        const href = await resolveAppEntryPath(auth.me);
        navigate(href, { replace: true });
        return;
      }
      setError("Still waiting for approval. A Bluearm product owner must approve your company in Platform Command.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <AuthShell
      title="Waiting for approval"
      subtitle="Your workspace was created and is pending product owner review."
      heroTitle="Almost there."
      heroBody="Self-serve signups need a Bluearm product owner to approve your company before you can open the ERP. Invited team members skip this step and join an already-approved company."
      trustPoints={[
        "You will keep the same Google sign-in after approval",
        "No action needed on your side while you wait",
        "Contact your Bluearm partner if this takes longer than expected",
      ]}
    >
      <div class="mt-8 space-y-4">
        <p class="text-sm text-text-secondary">
          We notified the product owners. Use Check again after they approve you in Platform Command → Customers.
        </p>
        <button
          type="button"
          disabled={checking()}
          class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          onClick={() => void checkAgain()}
        >
          {checking() ? "Checking…" : "Check again"}
        </button>
        <button
          type="button"
          class="w-full rounded-lg border border-stroke px-4 py-3 text-sm font-medium text-text-primary hover:bg-slate-50"
          onClick={() => navigate("/welcome", { replace: true })}
        >
          Back
        </button>
        <AuthAlert error={error()} />
      </div>
    </AuthShell>
  );
}
