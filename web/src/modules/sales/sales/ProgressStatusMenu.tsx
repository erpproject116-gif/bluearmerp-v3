import { For } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { progressStatusGroups } from "./progressStatus";

type Props = {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  disabled?: boolean;
  fallback?: string;
  /** Values that must be reached through a dedicated action, not direct selection. */
  excludeValues?: readonly string[];
};

export function ProgressStatusMenu(props: Props) {
  const fallback = () => props.fallback ?? "unconfirmed";
  const current = () => {
    const v = (props.value ?? "").trim();
    return v || fallback();
  };
  const groups = () => {
    const excluded = new Set(props.excludeValues ?? []);
    return progressStatusGroups()
      .map((group) => ({
        ...group,
        // Keep the current value visible for documents already in that state.
        options: group.options.filter((opt) => opt.value === current() || !excluded.has(opt.value)),
      }))
      .filter((group) => group.options.length > 0);
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
