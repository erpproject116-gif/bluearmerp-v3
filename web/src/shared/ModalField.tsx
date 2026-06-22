import { Show, type JSX } from "solid-js";
import { Field } from "./SpreadsheetGrid";
import type { FormFieldSetting } from "./useFormFieldSettings";
import { fieldDisabled, fieldRequired, fieldVisible, labelWithRequired } from "./useFormFieldSettings";

type Meta = { label: string; required: boolean; disabled: boolean };

type Props = {
  settings: () => Record<string, FormFieldSetting>;
  fieldKey: string;
  fallbackLabel: string;
  fallbackRequired?: boolean;
  span?: "full";
  children: (meta: Meta) => JSX.Element;
};

export function ModalField(props: Props) {
  const meta = () => {
    const f = props.settings()[props.fieldKey];
    if (!fieldVisible(f, true)) return null;
    const label = f?.label?.trim() || props.fallbackLabel;
    const required = fieldRequired(f, props.fallbackRequired ?? false);
    const disabled = fieldDisabled(f);
    return { label: labelWithRequired(label, required), required, disabled };
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
