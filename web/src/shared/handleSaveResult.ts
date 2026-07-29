import type { ApiResult } from "./api";
import { resolvePolicyActionHint } from "./policyActionHints";

export function formatApiErrors(errors?: Record<string, string>): string {
  if (!errors) return "";
  const messages = Object.values(errors).filter(Boolean);
  return messages.join(" · ");
}

export function isFieldValueMissing(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (typeof v === "number") return !Number.isFinite(v) || v <= 0;
  return false;
}

export function requireFields(values: Record<string, unknown>, fields: { key: string; label: string }[]): string | null {
  const missing = fields
    .filter((f) => isFieldValueMissing(values[f.key]))
    .map((f) => f.label);
  if (missing.length === 0) return null;
  return `Please fill in required fields: ${missing.join(", ")}.`;
}

type ToastLike = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  action?: (input: {
    type?: "success" | "error" | "warning";
    title: string;
    message?: string;
    actionLabel?: string;
    href?: string;
  }) => void;
};

export function handleSaveResult(
  res: ApiResult<unknown>,
  toast: ToastLike,
  successMessage = "Saved successfully.",
): boolean {
  if (res.success) {
    toast.success(successMessage);
    return true;
  }

  const fieldErrors = formatApiErrors(res.errors);
  const hint = resolvePolicyActionHint(res.errors);
  if (fieldErrors && hint && toast.action) {
    toast.action({
      type: "warning",
      title: fieldErrors,
      message: "Use the button to continue the required step.",
      actionLabel: hint.label,
      href: hint.href,
    });
    return false;
  }
  if (fieldErrors) {
    toast.error(fieldErrors);
    return false;
  }

  if (res.code === "ERR_MODULE_DISABLED" || res.code === "ERR_FEATURE_DISABLED") {
    const next =
      res.data && typeof res.data === "object" && "next" in res.data
        ? String((res.data as { next?: string }).next ?? "")
        : "/app/user-management/tenant-modules";
    if (toast.action) {
      toast.action({
        type: "warning",
        title: res.message ?? "This module is turned off for the workspace.",
        message: "Turn it on under Modules & Features, then try again.",
        actionLabel: "Open Modules & Features",
        href: next.includes("tenant-modules") ? next : "/app/user-management/tenant-modules",
      });
      return false;
    }
    toast.warning(res.message ?? "This module is turned off for the workspace.");
    return false;
  }

  if (res.code === "ERR_VALIDATION") {
    toast.warning(res.message ?? "Validation failed. Check the form and try again.");
    return false;
  }

  toast.error(res.message ?? "Save failed. Please try again.");
  return false;
}

export async function submitEntity(
  request: () => Promise<ApiResult<unknown>>,
  toast: ToastLike,
  successMessage: string,
): Promise<boolean> {
  try {
    const res = await request();
    return handleSaveResult(res, toast, successMessage);
  } catch {
    toast.error("Could not reach the API. Check your connection and try again.");
    return false;
  }
}
