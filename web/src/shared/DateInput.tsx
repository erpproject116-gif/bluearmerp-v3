import { splitProps, type JSX } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";

function openDatePicker(el: HTMLInputElement) {
  if (el.disabled || el.readOnly) return;
  try {
    el.showPicker?.();
  } catch {
    // showPicker may throw outside a user gesture in some browsers
  }
}

type DateInputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type">;

export function DateInput(props: DateInputProps) {
  const [local, rest] = splitProps(props, ["class", "onClick"]);

  return (
    <input
      type="date"
      class={`${local.class ?? inputClass} cursor-pointer`}
      onClick={(e) => {
        openDatePicker(e.currentTarget);
        if (typeof local.onClick === "function") {
          local.onClick(e);
        }
      }}
      {...rest}
    />
  );
}
