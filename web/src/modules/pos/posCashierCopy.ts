/** Plain-language POS API errors for non-tech cashiers. */

const CODE_HINTS: Record<string, string> = {
  ERR_SETUP_INCOMPLETE: "Finish workspace setup before selling. Ask a manager.",
  ERR_COMMERCIAL_LOCKED: "Buying and selling are locked until Day 1 setup is complete. Ask a manager.",
  ERR_FORBIDDEN: "You don’t have permission for that.",
  ERR_UNAUTHORIZED: "Sign in again to continue.",
  ERR_ROLE_PREVIEW_READ_ONLY: "Exit role preview before making sales.",
  ERR_RATE_LIMITED: "Too many requests — wait a moment and try again.",
  ERR_NOT_FOUND: "That record was not found.",
  ERR_VALIDATION: "Check the highlighted fields and try again.",
  ERR_POS_LOT_PICK: "Pick a lot for this item.",
  ERR_INTERNAL: "Something went wrong on the server. Try again or ask a manager.",
};

export function formatPosCashierError(res: {
  message?: string;
  code?: string;
  errors?: Record<string, string>;
}): string {
  // Prefer field messages — ERR_VALIDATION alone hides the real checkout reason (lot, stock, etc.).
  const fieldMsgs = res.errors ? Object.values(res.errors).filter(Boolean) : [];
  if (fieldMsgs.length) {
    const joined = fieldMsgs.join(" ");
    const lower = joined.toLowerCase();
    if (lower.includes("stock") || lower.includes("quantity") || lower.includes("insufficient")) {
      return "Not enough stock at this counter. Choose another item or ask a manager.";
    }
    if (lower.includes("serial")) {
      return "This item needs a serial number. Scan or pick the serial before paying.";
    }
    if (lower.includes("lot")) {
      return "This item needs a lot / batch. Pick a lot on the cart line before paying.";
    }
    if (lower.includes("cart")) {
      return joined;
    }
    if (lower.includes("tender")) {
      return "Payment amount is short of the total due (including tip).";
    }
    if (lower.includes("account") || lower.includes("accounting") || lower.includes("journal")) {
      return "Accounting setup blocked this sale. Ask a manager to check POS accounting accounts.";
    }
    if (lower.includes("partner") || lower.includes("customer") || lower.includes("walk-in")) {
      return "No walk-in customer is set up. Ask a manager to add a customer partner.";
    }
    if (lower.includes("tax type") || lower.includes("currency")) {
      return "Tax or currency setup is incomplete. Ask a manager.";
    }
    if (lower.includes("fiscal") || lower.includes("period")) {
      return "This date is outside an open fiscal period. Ask a manager.";
    }
    return joined;
  }

  const code = (res.code || "").trim();
  if (code && CODE_HINTS[code]) return CODE_HINTS[code];

  const msg = (res.message || "").trim();
  if (!msg) return "Could not complete that action. Try again.";
  if (/failed to|ERR_|sql|pq:/i.test(msg)) {
    return "Something went wrong. Try again or ask a manager.";
  }
  return msg;
}
