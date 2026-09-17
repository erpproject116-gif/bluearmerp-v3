/**

 * Plain-language ERP notification standard (What / Why / How + CTA).

 *

 * Every blocker toast or Smart Assist card should include:

 * - Title: what went wrong (plain words)

 * - Detail: why + how to fix (1–2 short sentences)

 * - Button: exact next place (action verb)

 *

 * Success toasts: short and concrete (what happened), not "successfully".

 * Never use only "Use the button to continue the required step."

 */

export const NOTIFICATION_FALLBACK_HOW_TO_FIX =
  "Fill the highlighted fields on this form, or use Ask Help if you are stuck. Then try Save again.";



export const NOTIFICATION_DEFAULT_SUCCESS = "Saved.";

export const NOTIFICATION_DEFAULT_SAVE_ERROR =

  "Couldn’t save. Check the highlighted fields or the message above, then try again.";

export const NOTIFICATION_NETWORK_ERROR =

  "Couldn’t reach the server. Check your connection and try again.";



/** Short recovery hint when we only have a field error + CTA. */

export const recoveryHintFromError = (fieldError: string): string => {

  const t = fieldError.trim();

  if (!t) return NOTIFICATION_FALLBACK_HOW_TO_FIX;

  if (/quotation line/i.test(t)) {
    return "Open Load Slip on the sales order, pick the open quotation lines again (Unconfirmed quotes are allowed), then save.";
  }

  if (/pick list|release/i.test(t)) {
    return "Confirm the sales order, Load Slip on this sale, and scan serials here. Use Pick List only if process policies require split release.";
  }

  if (/set.*progress.*completed|progress.*must be completed|not ready to invoice|isn.t ready to invoice/i.test(t)) {
    return "Set the sales order Progress to In progress or Completed, then try again.";
  }

  if (/confirm.*purchase|unconfirmed/i.test(t)) {

    return "Confirm the purchase order first, then try again.";

  }

  if (/goods receipt|purchase receive|serial.*stock|not in stock yet/i.test(t)) {

    return "Receive the items (and scan serials) under Purchase Receive, then try again.";

  }

  if (/attachment/i.test(t)) {

    return "Add the required file on the document, or ask an admin to change attachment settings.";

  }

  if (/stock|insufficient|on hand|not enough/i.test(t)) {

    return "Check Inv Per Branch for available qty, or receive/adjust stock first.";

  }

  if (/deliver/i.test(t)) {

    return "Post a Delivery note on the sales order, then try again.";

  }

  if (/fiscal|period|closed|backdat/i.test(t)) {

    return "Use a date in an open period, or ask an admin under Fiscal years.";

  }

  if (/approv/i.test(t)) {

    return "Open Approvals (or ask an approver), then try again.";

  }

  if (/balance|qty|quantity|higher than|exceeds/i.test(t)) {

    return "Lower the quantity to what is still open, or finish the prior step first.";

  }

  if (/base unit|Inventory → Items|Inventory -> Items/i.test(t)) {
    return "Open Inventory → Items, edit the product, set Base unit (for example Piece), Save, then try the purchase order again.";
  }

  if (/add conversion|unit.?conversion|Inventory → Units|Inventory -> Units/i.test(t)) {
    return "On each part line, keep UoM as the item’s base unit (auto-filled when you pick the item), or add the named conversion under Inventory → Units, then Save again.";
  }

  if (/customer/i.test(t)) {
    return "Pick a customer in the Customer field (search by name). Use + New on that lookup if they are not listed yet, then Save.";
  }

  if (/vendor|supplier/i.test(t) && /required|missing|pick/i.test(t)) {
    return "Pick a vendor in the Vendor field (search by name), then Save.";
  }

  if (/required|missing|is required/i.test(t)) {
    return "Fill in the highlighted fields on this form, then try Save again.";
  }

  return NOTIFICATION_FALLBACK_HOW_TO_FIX;

};



/** True when the recovery hint adds real guidance beyond the generic CTA line. */

export const hasSpecificRecoveryHint = (fieldError: string): boolean =>

  recoveryHintFromError(fieldError) !== NOTIFICATION_FALLBACK_HOW_TO_FIX;


