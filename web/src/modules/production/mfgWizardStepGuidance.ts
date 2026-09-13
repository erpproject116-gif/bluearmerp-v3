import type { FormErrors } from "../../shared/formValidation";
import { validateWasteLine } from "./mfgRules";

/** Field keys for sticky wizard guidance (merged with validation fieldErrors). */
export const MFG_WIZARD_GUIDANCE_KEYS = ["stock", "waste", "take_materials"] as const;

export type MfgWizardGuidanceKey = (typeof MFG_WIZARD_GUIDANCE_KEYS)[number];

export function isMfgWizardGuidanceKey(key: string): key is MfgWizardGuidanceKey {
  return (MFG_WIZARD_GUIDANCE_KEYS as readonly string[]).includes(key);
}

export function recipeAssemblyStepGuidance(
  step: number,
  opts: {
    hasShortage: boolean;
    postBlockedLabel: string;
    takeMaterialsNext: boolean;
  },
): FormErrors {
  if (step < 2) return {};
  const out: FormErrors = {};
  if (opts.hasShortage) {
    out.stock =
      step === 2
        ? "Some components are short. You can save the draft; posting stays blocked until stock is enough."
        : `Not enough parts on hand. Save draft, restock, then ${opts.postBlockedLabel}.`;
  }
  if (step === 3 && opts.takeMaterialsNext) {
    out.take_materials =
      "This job needs serial/lot steps on the floor. Posting will start the job — Take materials or Record finished comes next.";
  }
  return out;
}

export function cuttingStepGuidance(
  step: number,
  opts: {
    hasInputShortage: boolean;
    inputTracked: boolean;
    wasteReasonId: number | null;
    wasteQty: number;
    wasteLines: { qty: number; expected_qty: number; waste_reason_id?: number }[];
    reasons: { id: number; is_abnormal: boolean }[];
  },
): FormErrors {
  if (step < 2) return {};
  const out: FormErrors = {};
  if (opts.hasInputShortage) {
    out.stock =
      step === 2
        ? "Raw material is short. You can save the draft; Post Production stays blocked until stock is enough."
        : "Not enough raw material on hand. Restock, then Post Production.";
  }
  if (step === 3 && opts.inputTracked) {
    out.take_materials =
      "This cut needs a whole serial/lot from stock. Post Production will start the job — Take from stock comes next.";
  }
  for (const w of opts.wasteLines) {
    const isAbnormal =
      opts.reasons.find((r) => r.id === (w.waste_reason_id ?? opts.wasteReasonId ?? undefined))?.is_abnormal ?? false;
    const msg = validateWasteLine(w.qty, w.expected_qty, w.waste_reason_id ?? opts.wasteReasonId, isAbnormal);
    if (msg) {
      out.waste = msg;
      break;
    }
  }
  if (!out.waste && step >= 2 && opts.wasteQty > 0 && !opts.wasteReasonId) {
    out.waste = "Pick a waste reason when you enter extra waste qty.";
  }
  return out;
}
