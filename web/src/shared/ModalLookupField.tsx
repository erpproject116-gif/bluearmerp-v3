import { Show } from "solid-js";
import { LookupCombo, type LookupOption } from "./LookupCombo";
import type { FormFieldSetting } from "./useFormFieldSettings";
import {
  fieldDisabled,
  fieldPlaceholder,
  fieldRequired,
  fieldVisible,
  labelWithRequired,
} from "./useFormFieldSettings";

type Props = {
  settings: () => Record<string, FormFieldSetting>;
  fieldKey: string;
  fallbackLabel: string;
  fallbackRequired?: boolean;
  fallbackPlaceholder?: string;
  /** When true, field stays visible even if form settings hide it. */
  forceVisible?: boolean;
  /** When true, field is always treated as required. */
  forceRequired?: boolean;
  value: () => string;
  selectedId: () => number | null;
  onInput: (text: string) => void;
  onSelect: (opt: LookupOption) => void;
  onClear: () => void;
  fetchOptions: (q: string) => Promise<LookupOption[]>;
  onCreate?: (query: string) => void;
  createLabel?: string;
};

export function ModalLookupField(props: Props) {
  const setting = () => props.settings()[props.fieldKey];
  const visible = () => props.forceVisible || fieldVisible(setting(), true);
  const label = () => {
    const f = setting();
    return labelWithRequired(f?.label?.trim() || props.fallbackLabel, required());
  };
  const required = () => props.forceRequired || fieldRequired(setting(), props.fallbackRequired ?? false);
  const disabled = () => fieldDisabled(setting());
  const placeholder = () => fieldPlaceholder(setting(), props.fallbackPlaceholder) || undefined;

  // Boolean `when` — avoid remounting LookupCombo when a new meta object is allocated each read.
  return (
    <Show when={visible()}>
      <LookupCombo
        label={label()}
        required={required()}
        disabled={disabled()}
        placeholder={placeholder()}
        value={props.value}
        selectedId={props.selectedId}
        onInput={props.onInput}
        onSelect={props.onSelect}
        onClear={props.onClear}
        fetchOptions={props.fetchOptions}
        onCreate={props.onCreate}
        createLabel={props.createLabel}
      />
    </Show>
  );
}
