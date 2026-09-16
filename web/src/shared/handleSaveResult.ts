import type { ApiResult } from "./api";
import type { FormErrors } from "./formValidation";
import { formErrorsSummary } from "./formValidation";
import {
  hasSpecificRecoveryHint,
  NOTIFICATION_DEFAULT_SAVE_ERROR,
  NOTIFICATION_DEFAULT_SUCCESS,
  NOTIFICATION_NETWORK_ERROR,
  recoveryHintFromError,
} from "./notificationMessageStandard";
import { resolvePolicyActionHint } from "./policyActionHints";

export function formatApiErrors(errors?: FormErrors | Record<string, string> | null): string {
  if (!errors) return "";
  const messages = Object.values(errors).filter((m): m is string => Boolean(m));
  return messages.join(" · ");
}

export function isFieldValueMissing(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (typeof v === "number") return !Number.isFinite(v) || v <= 0;
  return false;
}

export function collectRequiredFieldErrors(
  values: Record<string, unknown>,
  fields: { key: string; label: string }[],
): FormErrors {
  const errors: FormErrors = {};
  for (const f of fields) {
    if (isFieldValueMissing(values[f.key])) {
      errors[f.key] = `${f.label} is required.`;
    }
  }
  return errors;
}

export function requireFields(values: Record<string, unknown>, fields: { key: string; label: string }[]): string | null {
  return formErrorsSummary(collectRequiredFieldErrors(values, fields));
}

export function applyApiFieldErrors(
  errors: Record<string, string> | undefined,
  setFieldErrors?: (errors: FormErrors) => void,
): FormErrors {
  const map: FormErrors = { ...(errors ?? {}) };
  if (setFieldErrors && Object.keys(map).length > 0) setFieldErrors(map);
  return map;
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
    askHelp?: boolean;
  }) => void;
};

function pushHelpBlocker(
  toast: ToastLike,
  title: string,
  message?: string,
  type: "error" | "warning" = "warning",
) {
  if (toast.action) {
    toast.action({
      type,
      title,
      message,
      askHelp: true,
    });
    return;
  }
  if (type === "error") toast.error([title, message].filter(Boolean).join(" — "));
  else toast.warning([title, message].filter(Boolean).join(" — "));
}

export function handleSaveResult(
  res: ApiResult<unknown>,
  toast: ToastLike,
  successMessage = NOTIFICATION_DEFAULT_SUCCESS,
  options?: { onFieldErrors?: (errors: FormErrors) => void },
): boolean {
  if (res.success) {
    toast.success(successMessage);
    return true;
  }
  return showBlockerResult(res, toast, options);
}

/** Show What/Why/How for a failed API result (save or side action). Returns false. */
export function showBlockerResult(
  res: ApiResult<unknown>,
  toast: ToastLike,
  options?: { onFieldErrors?: (errors: FormErrors) => void; fallbackTitle?: string },
): false {
  // Smart Assist: server-authored recovery (prefer over generic field toasts).
  const assist = res.assist;
  if (assist?.title && toast.action) {
    const primary = assist.actions?.[0];
    toast.action({
      type: "warning",
      title: assist.title,
      message: assist.detail || undefined,
      actionLabel: primary?.label ?? "View",
      href: primary?.href,
      askHelp: true,
    });
    return false;
  }
  if (assist?.title) {
    pushHelpBlocker(toast, assist.title, assist.detail || undefined);
    return false;
  }

  applyApiFieldErrors(res.errors, options?.onFieldErrors);
  const fieldErrors = formatApiErrors(res.errors);
  const hint = resolvePolicyActionHint(res.errors);
  if (fieldErrors && hint && toast.action) {
    toast.action({
      type: "warning",
      title: fieldErrors,
      message: recoveryHintFromError(fieldErrors),
      actionLabel: hint.label,
      href: hint.href,
      askHelp: true,
    });
    return false;
  }
  if (fieldErrors) {
    // Always pair What (field error) with How — never toast the bare field message alone.
    const how = recoveryHintFromError(fieldErrors);
    if (toast.action) {
      toast.action({
        type: hasSpecificRecoveryHint(fieldErrors) ? "warning" : "error",
        title: fieldErrors,
        message: how,
        askHelp: true,
      });
    } else {
      pushHelpBlocker(toast, fieldErrors, how, hasSpecificRecoveryHint(fieldErrors) ? "warning" : "error");
    }
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
        askHelp: true,
      });
      return false;
    }
    toast.warning(res.message ?? "This module is turned off for the workspace.");
    return false;
  }

  if (res.code === "ERR_VALIDATION") {
    pushHelpBlocker(
      toast,
      res.message ?? "Something on this form needs fixing. Check the highlighted fields and try again.",
    );
    return false;
  }

  const msg = (res.message ?? "").trim();
  if (msg && hasSpecificRecoveryHint(msg)) {
    pushHelpBlocker(toast, msg, recoveryHintFromError(msg));
    return false;
  }
  if (msg) {
    pushHelpBlocker(toast, msg);
    return false;
  }
  pushHelpBlocker(toast, options?.fallbackTitle ?? NOTIFICATION_DEFAULT_SAVE_ERROR, undefined, "error");
  return false;
}

export async function submitEntity(
  request: () => Promise<ApiResult<unknown>>,
  toast: ToastLike,
  successMessage: string,
  options?: { onFieldErrors?: (errors: FormErrors) => void },
): Promise<boolean> {
  try {
    const res = await request();
    return handleSaveResult(res, toast, successMessage, options);
  } catch {
    toast.error(NOTIFICATION_NETWORK_ERROR);
    return false;
  }
}

/**
 * Client-side validation blockers (empty Save before API).
 * Same What / Why / How + Ask Help as API field errors — never a bare field string.
 */
export function showClientValidationBlocker(
  errors: FormErrors,
  toast: ToastLike,
): false {
  const fieldErrors = formatApiErrors(errors);
  if (!fieldErrors) {
    pushHelpBlocker(toast, NOTIFICATION_DEFAULT_SAVE_ERROR, undefined, "error");
    return false;
  }
  const how = recoveryHintFromError(fieldErrors);
  const hint = resolvePolicyActionHint(errors);
  if (toast.action) {
    toast.action({
      type: "warning",
      title: fieldErrors,
      message: how,
      actionLabel: hint?.label,
      href: hint?.href,
      askHelp: true,
    });
    return false;
  }
  pushHelpBlocker(toast, fieldErrors, how);
  return false;
}
