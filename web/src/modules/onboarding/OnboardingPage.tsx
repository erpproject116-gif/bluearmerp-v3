import { A } from "@solidjs/router";
import { OnboardingChecklist } from "../../shared/OnboardingChecklist";
import { apiFetch } from "../../shared/api";

export default function OnboardingPage() {
  const dismiss = async () => {
    await apiFetch("/api/v1/platform/onboarding/dismiss", { method: "POST" }, { silent: true });
    window.location.href = "/app/dashboard";
  };

  return (
    <div class="mx-auto max-w-2xl p-6">
      <h1 class="text-xl font-semibold text-text-primary">Your first week with Bluearm</h1>
      <p class="mt-2 text-sm text-text-secondary">
        Follow this checklist in order. Each step links to the right screen — no jargon, just what to do next.
      </p>

      <div class="mt-6">
        <OnboardingChecklist />
      </div>

      <div class="mt-8 space-y-4 text-sm text-text-secondary">
        <p>
          <strong class="text-text-primary">Day 1 — Set up.</strong> Add your company name, customers or suppliers, and your first products.
        </p>
        <p>
          <strong class="text-text-primary">Day 2–3 — First sale.</strong> Create a quotation or sales invoice to see the full selling flow.
        </p>
        <p>
          <strong class="text-text-primary">Day 4+ — Team & overview.</strong> Invite a teammate and open the Business Dashboard for alerts.
        </p>
        <p>
          More detail in <A href="/app/documentation" class="text-brand-600 hover:underline">Help & guides</A>.
        </p>
      </div>

      <button
        type="button"
        class="mt-8 text-xs text-text-secondary hover:underline"
        onClick={() => void dismiss()}
      >
        Dismiss checklist
      </button>
    </div>
  );
}
