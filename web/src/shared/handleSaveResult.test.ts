import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "./api";
import { handleSaveResult } from "./handleSaveResult";

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

  it("falls back to field error toast when no assist", () => {
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      action: vi.fn(),
    };
    handleSaveResult(failRes({ errors: { name: "Required." } }), toast);
    expect(toast.error).toHaveBeenCalledWith("Required.");
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
});
