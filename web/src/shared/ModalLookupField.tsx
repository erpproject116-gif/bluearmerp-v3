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
import type { ModalFieldMeta } from "./ModalField";

type Props = {
  settings: () => Record<string, FormFieldSetting>;
  fieldKey: string;
  fallbackLabel: string;
  fallbackRequired?: boolean;
  fallbackPlaceholder?: string;
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
  const meta = (): ModalFieldMeta | null => {
    const f = props.settings()[props.fieldKey];
    if (!fieldVisible(f, true)) return null;
    const label = f?.label?.trim() || props.fallbackLabel;
    const required = fieldRequired(f, props.fallbackRequired ?? false);
    const disabled = fieldDisabled(f);
    const placeholder = fieldPlaceholder(f, props.fallbackPlaceholder);
    return {
      label: labelWithRequired(label, required),
      required,
      disabled,
      placeholder: placeholder || undefined,
    };
  };

  return (
    <Show when={meta()}>
      {(m) => (
        <LookupCombo
          label={m().label}
          required={m().required}
          disabled={m().disabled}
          placeholder={m().placeholder}
          value={props.value}
          selectedId={props.selectedId}
          onInput={props.onInput}
          onSelect={props.onSelect}
          onClear={props.onClear}
          fetchOptions={props.fetchOptions}
          onCreate={props.onCreate}
          createLabel={props.createLabel}
        />
      )}
    </Show>
  );
}
