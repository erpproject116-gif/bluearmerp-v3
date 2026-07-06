import type { JSX } from "solid-js";
import { bindDecimalInput, bindQtyInput, sanitizeIntegerInput } from "./money";

type Props = {
  value: string;
  onValue: (v: string) => void;
  /** decimal = currency (2 dp max); qty = quantity (4 dp max); integer = whole numbers only */
  mode?: "decimal" | "qty" | "integer";
  class?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
};

/** Text input that accepts numeric entry only (no native number spinners). */
export function DecimalInput(props: Props) {
  const onInput: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (e) => {
    const el = e.currentTarget;
    if (props.mode === "qty") bindQtyInput(el, props.onValue);
    else if (props.mode === "integer") {
      const v = sanitizeIntegerInput(el.value);
      if (el.value !== v) el.value = v;
      props.onValue(v);
    } else bindDecimalInput(el, props.onValue);
  };

  return (
    <input
      type="text"
      inputmode={props.mode === "integer" ? "numeric" : "decimal"}
      autocomplete="off"
      class={props.class}
      placeholder={props.placeholder}
      disabled={props.disabled}
      title={props.title}
      value={props.value}
      onInput={onInput}
    />
  );
}
