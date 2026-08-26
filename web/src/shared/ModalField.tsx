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
  /** Passed to Field — div for rich-text so a wrapping label does not block typing. */
  as?: "label" | "div";
  children: (meta: ModalFieldMeta) => JSX.Element;
};

export function ModalField(props: Props) {
  const setting = () => props.settings()[props.fieldKey];
  const visible = () => props.forceVisible || fieldVisible(setting(), true);
  const required = () =>
    props.forceRequired
      ? true
      : DEFAULTED_STATUS_FIELDS.has(props.fieldKey)
        ? false
        : fieldRequired(setting(), props.fallbackRequired ?? false);
  const disabled = () => fieldDisabled(setting());
  const placeholder = () => fieldPlaceholder(setting(), props.fallbackPlaceholder) || undefined;
  const label = () => labelWithRequired(setting()?.label?.trim() || props.fallbackLabel, required());

  // Live meta object with getters so children see updates without remounting on object identity.
  const meta = (): ModalFieldMeta => ({
    get label() {
      return label();
    },
    get required() {
      return required();
    },
    get disabled() {
      return disabled();
    },
    get placeholder() {
      return placeholder();
    },
  });

  // Boolean `when` — avoid remount when a new plain meta object would change Show's key.
  return (
    <Show when={visible()}>
      <Field label={label()} span={props.span} as={props.as}>
        {props.children(meta())}
      </Field>
    </Show>
  );
}
