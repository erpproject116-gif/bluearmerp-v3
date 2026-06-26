import { For } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { progressStatusGroups } from "./progressStatus";

type Props = {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  disabled?: boolean;
};

export function ProgressStatusMenu(props: Props) {
  const groups = () => progressStatusGroups();
  return (
    <select
      class={props.class ?? inputClass}
      value={props.value}
      disabled={props.disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        props.onChange(e.currentTarget.value);
      }}
    >
      <For each={groups()}>
        {(group) => (
          <optgroup label={group.label}>
            <For each={group.options}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
          </optgroup>
        )}
      </For>
    </select>
  );
}
