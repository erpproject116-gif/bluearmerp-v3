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

  "Follow the button, finish that step, then come back here and try again.";



export const NOTIFICATION_DEFAULT_SUCCESS = "Saved.";

export const NOTIFICATION_DEFAULT_SAVE_ERROR =

  "Couldn’t save. Check the highlighted fields or the message above, then try again.";

export const NOTIFICATION_NETWORK_ERROR =

  "Couldn’t reach the server. Check your connection and try again.";



/** Short recovery hint when we only have a field error + CTA. */

export const recoveryHintFromError = (fieldError: string): string => {

  const t = fieldError.trim();

  if (!t) return NOTIFICATION_FALLBACK_HOW_TO_FIX;

  if (/pick list|release/i.test(t)) {

    return "Open the sales order, use Pick List to release qty and scan the serial, then Load Slip on this sale.";

  }

  if (/completed|progress/i.test(t)) {

    return "Set the sales order progress to Completed, then try again.";

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

  if (/required|missing|is required/i.test(t)) {

    return "Fill in the highlighted fields, then try again.";

  }

  return NOTIFICATION_FALLBACK_HOW_TO_FIX;

};



/** True when the recovery hint adds real guidance beyond the generic CTA line. */

export const hasSpecificRecoveryHint = (fieldError: string): boolean =>

  recoveryHintFromError(fieldError) !== NOTIFICATION_FALLBACK_HOW_TO_FIX;


