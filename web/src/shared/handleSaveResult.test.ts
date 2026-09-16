import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "./api";
import { handleSaveResult, showBlockerResult, showClientValidationBlocker } from "./handleSaveResult";
import { recoveryHintFromError, hasSpecificRecoveryHint } from "./notificationMessageStandard";
import { resolvePolicyActionHint } from "./policyActionHints";

function failRes(partial: Partial<ApiResult<unknown>>): ApiResult<unknown> {
  return {
    success: false,
    status: 400,
    ok: false,
    message: "Validation failed.",
    code: "ERR_VALIDATION",
    ...partial,
  };
}

describe("handleSaveResult", () => {
  it("prefers assist toast.action over field errors", () => {
    const action = vi.fn();
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      action,
    };
    const ok = handleSaveResult(
      failRes({
        errors: { qty: "Quantity exceeds PO balance (1.0000)." },
        assist: {
          code: "SA_SI_QTY_EXCEEDS_PO_BALANCE",
          title: "Quantity exceeds open PO balance",
          detail: "Only 1.0000 remains on this PO line.",
          actions: [{ label: "Open Purchase Receive", href: "/app/purchase-order/goods-receipt" }],
        },
      }),
      toast,
    );
    expect(ok).toBe(false);
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Quantity exceeds open PO balance",
        message: "Only 1.0000 remains on this PO line.",
        actionLabel: "Open Purchase Receive",
        href: "/app/purchase-order/goods-receipt",
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("adds how-to-fix when field error has a specific recovery hint", () => {
    const action = vi.fn();
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      action,
    };
    handleSaveResult(failRes({ errors: { name: "Name is required." } }), toast);
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Name is required.",
        message: expect.stringMatching(/fill in the highlighted fields|pick a customer/i),
        askHelp: true,
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("client validation toast includes How + Open Customers for Customer is required", () => {
    const action = vi.fn();
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      action,
    };
    showClientValidationBlocker({ partner_id: "Customer is required." }, toast);
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Customer is required.",
        message: expect.stringMatching(/pick a customer/i),
        actionLabel: expect.stringMatching(/customer/i),
        href: "/app/inventory/partners",
        askHelp: true,
      }),
    );
  });

  it("uses warning when assist present but toast.action missing", () => {
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };
    handleSaveResult(
      failRes({
        assist: {
          code: "SA_FISCAL_PERIOD_CLOSED",
          title: "Fiscal period is closed",
          detail: "Reopen July 2026 under Fiscal years.",
        },
      }),
      toast,
    );
    expect(toast.warning).toHaveBeenCalledWith(
      "Fiscal period is closed — Reopen July 2026 under Fiscal years.",
    );
  });

  it("uses plain how-to-fix recovery when field errors have a policy hint", () => {
    const action = vi.fn();
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      action,
    };
    handleSaveResult(
      failRes({
        errors: {
          lines:
            "This item isn’t ready to invoice yet. For serial items, open the sales order → Pick List → release qty and scan the serial, then use Load Slip on this sale.",
        },
      }),
      toast,
    );
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "/app/sales-order/sales-orders",
        askHelp: true,
      }),
    );
    const call = action.mock.calls[0][0] as { actionLabel?: string; message?: string };
    expect(call.actionLabel).toMatch(/Sales Order|Pick items|Complete/i);
    const msg = (call.message ?? "").toLowerCase();
    expect(msg).not.toContain("use the button to continue");
    expect(msg).toMatch(/pick list|load slip|scan serial|sales order|highlighted/);
  });
});

describe("showBlockerResult", () => {
  it("surfaces assist for side-action failures", () => {
    const action = vi.fn();
    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), action };
    showBlockerResult(
      failRes({
        assist: {
          code: "SA_INSUFFICIENT_STOCK",
          title: "Not enough stock on hand",
          detail: "Check Inv Per Branch.",
          actions: [{ label: "Open Inv Per Branch", href: "/app/inventory/find-stock" }],
        },
      }),
      toast,
    );
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Not enough stock on hand",
        actionLabel: "Open Inv Per Branch",
      }),
    );
  });

  it("uses fallbackTitle when message is empty", () => {
    const action = vi.fn();
    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), action };
    showBlockerResult(failRes({ message: "", code: "ERR_INTERNAL", errors: undefined }), toast, {
      fallbackTitle: "Couldn't finish that step. Try again.",
    });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't finish that step. Try again.",
        type: "error",
        askHelp: true,
      }),
    );
  });
});

describe("notification helpers", () => {
  it("recoveryHintFromError recognizes pick list and stock", () => {
    expect(recoveryHintFromError("Pick List release required").toLowerCase()).toMatch(/pick list|load slip/);
    expect(hasSpecificRecoveryHint("Name is required.")).toBe(true);
  });

  it("resolvePolicyActionHint maps serial receive messages", () => {
    const hint = resolvePolicyActionHint({
      lines: "Serial numbers required before confirming this bill. Receive under Purchase Receive.",
    });
    expect(hint?.href).toContain("purchase-receive");
  });
});
