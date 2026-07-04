import { Show } from "solid-js";
import { TERMS, type TermKey } from "./terminology";

type Props = {
  /** A known terminology key, e.g. "vat". */
  term?: TermKey;
  /** Or provide explicit label/hint directly. */
  label?: string;
  hint?: string;
  class?: string;
};

/**
 * Renders a label followed by a small "?" that shows a plain-language explanation
 * on hover/focus. Use for accounting terms we must keep (VAT, Official Receipt, etc.).
 */
export function TermHint(props: Props) {
  const label = () => props.label ?? (props.term ? TERMS[props.term].label : "");
  const hint = () => props.hint ?? (props.term ? TERMS[props.term].hint : undefined);

  return (
    <span class={`inline-flex items-center gap-1 ${props.class ?? ""}`}>
      <span>{label()}</span>
      <Show when={hint()}>
        <span
          class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-stroke text-[10px] leading-none text-text-secondary"
          title={hint()}
          aria-label={hint()}
        >
          ?
        </span>
      </Show>
    </span>
  );
}
