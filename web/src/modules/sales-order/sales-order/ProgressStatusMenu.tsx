import { For } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { progressStatusGroups } from "./progressStatus";

type Props = {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  disabled?: boolean;
  fallback?: string;
};

export function ProgressStatusMenu(props: Props) {
  const fallback = () => props.fallback ?? "unconfirmed";
  const current = () => {
    const v = (props.value ?? "").trim();
    return v || fallback();
  };
  return (
    <select
      class={props.class ?? inputClass}
      value={current()}
      disabled={props.disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        props.onChange(e.currentTarget.value.trim() || fallback());
      }}
    >
      <For each={progressStatusGroups()}>
        {(group) => (
          <optgroup label={group.label}>
            <For each={group.options}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
          </optgroup>
        )}
      </For>
    </select>
  );
}
