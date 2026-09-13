import { For, Show } from "solid-js";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import type { FormErrors } from "../../shared/formValidation";
import { hasFormErrors } from "../../shared/formValidation";
import { isMfgWizardGuidanceKey } from "./mfgWizardStepGuidance";

const guidanceTitles: Record<string, string> = {
  stock: "Stock check",
  waste: "Waste reason",
  take_materials: "Next on the floor",
};

type Props = {
  step: () => number;
  validationErrors: () => FormErrors;
  stepGuidance: () => FormErrors;
  stickySteps?: number[];
};

/** Sticky inline banners on wizard steps 2/3 (shortage, waste, take materials). */
export function MfgWizardStickyAlerts(props: Props) {
  const stickySteps = () => props.stickySteps ?? [2, 3];
  const sticky = () => stickySteps().includes(props.step());

  const inlineGuidance = (): FormErrors => {
    const validation = props.validationErrors();
    const out: FormErrors = {};
    for (const [key, message] of Object.entries(props.stepGuidance())) {
      if (!message || !isMfgWizardGuidanceKey(key)) continue;
      if (validation[key]) continue;
      out[key] = message;
    }
    return out;
  };

  const showRegion = () =>
    sticky() && (hasFormErrors(props.validationErrors()) || hasFormErrors(inlineGuidance()));

  return (
    <Show when={showRegion()}>
      <div
        class="sticky top-0 z-20 -mx-1 space-y-2 rounded-xl border border-stroke/80 bg-slate-50/95 px-3 py-2 shadow-sm backdrop-blur-sm"
        role="region"
        aria-label="Step guidance"
      >
        <FormErrorSummary errors={props.validationErrors} title="Fix before you continue:" />
        <Show when={hasFormErrors(inlineGuidance())}>
          <div class="space-y-2">
            <For each={Object.entries(inlineGuidance()).filter(([, m]) => Boolean(m))}>
              {([key, message]) => (
                <div
                  class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                  role="status"
                >
                  <p class="font-medium">{guidanceTitles[key] ?? "Note"}</p>
                  <p class="mt-0.5">{message}</p>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
