import { createSignal, type Accessor } from "solid-js";
import type { FormErrors } from "./formValidation";
import { firstFormError, formErrorsSummary, hasFormErrors, mergeFormErrors, pruneFormErrors } from "./formValidation";

export function useFormErrors(initial: FormErrors = {}) {
  const [errors, setErrors] = createSignal<FormErrors>(initial);

  const fieldError: Accessor<(key: string) => string | undefined> = () => (key: string) => errors()[key];

  const clearErrors = () => setErrors({});

  const clearField = (key: string) => setErrors((prev) => pruneFormErrors(prev, key));

  const applyErrors = (...parts: (FormErrors | null | undefined)[]) => {
    const merged = mergeFormErrors(...parts);
    setErrors(merged);
    return merged;
  };

  const summary = () => formErrorsSummary(errors());
  const firstError = () => firstFormError(errors());
  const hasErrors = () => hasFormErrors(errors());

  return {
    errors,
    setErrors,
    fieldError,
    clearErrors,
    clearField,
    applyErrors,
    summary,
    firstError,
    hasErrors,
  };
}
