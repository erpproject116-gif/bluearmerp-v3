import { For, Show } from "solid-js";
import type { FormErrors } from "./formValidation";
import { hasFormErrors } from "./formValidation";
import { recoveryHintFromError } from "./notificationMessageStandard";

type Props = {
  errors: () => FormErrors;
  title?: string;
};

/** Top-of-form validation summary for modals and full-page forms (What + How). */
export function FormErrorSummary(props: Props) {
  const entries = () => Object.entries(props.errors()).filter(([, message]) => Boolean(message));
  const how = () => {
    const first = entries()[0]?.[1];
    return first ? recoveryHintFromError(first) : "";
  };
  return (
    <Show when={hasFormErrors(props.errors())}>
      <div
        class="col-span-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        role="alert"
        aria-live="polite"
      >
        <p class="font-medium">{props.title ?? "What needs fixing"}</p>
        <ul class="mt-1 list-disc space-y-0.5 pl-5">
          <For each={entries()}>{([, message]) => <li>{message}</li>}</For>
        </ul>
        <Show when={how()}>
          <p class="mt-2 text-xs leading-relaxed text-red-900/90">
            <span class="font-semibold">How: </span>
            {how()}
          </p>
        </Show>
      </div>
    </Show>
  );
}
