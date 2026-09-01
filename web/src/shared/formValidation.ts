/** Field-keyed validation messages for inline form errors. */
export type FormErrors = Record<string, string | undefined>;

export function fieldDomIds(fieldKey: string, formId = "form") {
  const safe = fieldKey.replace(/[^a-zA-Z0-9_-]/g, "-");
  const base = `${formId}-${safe}`;
  return {
    inputId: base,
    hintId: `${base}-hint`,
    errorId: `${base}-error`,
  };
}

export function inputAriaProps(
  fieldKey: string,
  opts?: { formId?: string; error?: string; description?: string; required?: boolean },
) {
  const { inputId, hintId, errorId } = fieldDomIds(fieldKey, opts?.formId);
  const describedBy = [opts?.description ? hintId : undefined, opts?.error ? errorId : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
  return {
    id: inputId,
    "aria-invalid": opts?.error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    "aria-required": opts?.required ? (true as const) : undefined,
    hintId,
    errorId,
  };
}

export function hasFormErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function mergeFormErrors(...parts: (FormErrors | null | undefined)[]): FormErrors {
  const merged: FormErrors = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, message] of Object.entries(part)) {
      if (message) merged[key] = message;
    }
  }
  return merged;
}

export function firstFormError(errors: FormErrors): string | null {
  for (const message of Object.values(errors)) {
    if (message) return message;
  }
  return null;
}

export function formErrorsSummary(errors: FormErrors): string | null {
  const messages = Object.values(errors).filter(Boolean) as string[];
  if (messages.length === 0) return null;
  if (messages.length === 1) return messages[0]!;
  return `Please fix ${messages.length} fields below.`;
}

export function pruneFormErrors(errors: FormErrors, key: string): FormErrors {
  if (!errors[key]) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}
