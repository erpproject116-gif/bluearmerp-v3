import type { ApiResult } from "./api";

export function formatApiErrors(errors?: Record<string, string>): string {
  if (!errors) return "";
  const messages = Object.values(errors).filter(Boolean);
  return messages.join(" · ");
}

export function requireFields(values: Record<string, unknown>, fields: { key: string; label: string }[]): string | null {
  const missing = fields
    .filter((f) => {
      const v = values[f.key];
      if (v == null) return true;
      if (typeof v === "string") return !v.trim();
      return false;
    })
    .map((f) => f.label);
  if (missing.length === 0) return null;
  return `Please fill in required fields: ${missing.join(", ")}.`;
}

type ToastLike = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
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
  if (fieldErrors) {
    toast.error(fieldErrors);
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
