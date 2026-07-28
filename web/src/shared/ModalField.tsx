import { Show, type JSX } from "solid-js";
import { Field } from "./SpreadsheetGrid";
import type { FormFieldSetting } from "./useFormFieldSettings";
import {
  fieldDisabled,
  fieldPlaceholder,
  fieldRequired,
  fieldVisible,
  labelWithRequired,
  DEFAULTED_STATUS_FIELDS,
} from "./useFormFieldSettings";

export type ModalFieldMeta = {
  label: string;
  required: boolean;
  disabled: boolean;
  placeholder?: string;
};

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
  span?: "full";
  children: (meta: ModalFieldMeta) => JSX.Element;
};

export function ModalField(props: Props) {
  const meta = (): ModalFieldMeta | null => {
    const f = props.settings()[props.fieldKey];
    if (!props.forceVisible && !fieldVisible(f, true)) return null;
    const label = f?.label?.trim() || props.fallbackLabel;
    const required = props.forceRequired
      ? true
      : DEFAULTED_STATUS_FIELDS.has(props.fieldKey)
        ? false
        : fieldRequired(f, props.fallbackRequired ?? false);
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
        <Field label={m().label} span={props.span}>
          {props.children(m())}
        </Field>
      )}
    </Show>
  );
}
