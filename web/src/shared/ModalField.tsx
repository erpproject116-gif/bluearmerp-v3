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
import { inputAriaProps } from "./formValidation";

export type ModalFieldInputProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
};

export type ModalFieldMeta = {
  label: string;
  required: boolean;
  disabled: boolean;
  placeholder?: string;
  error?: string;
  inputProps: ModalFieldInputProps;
};

type Props = {
  settings: () => Record<string, FormFieldSetting>;
  fieldKey: string;
  fallbackLabel: string;
  fallbackRequired?: boolean;
  fallbackPlaceholder?: string;
  /** Prefix for stable input ids inside a modal (e.g. "partner-form"). */
  formId?: string;
  /** Field-keyed validation messages from the parent form. */
  errors?: () => Record<string, string | undefined>;
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
  const plainLabel = () => setting()?.label?.trim() || props.fallbackLabel;
  const error = () => props.errors?.()[props.fieldKey];
  const aria = () =>
    inputAriaProps(props.fieldKey, {
      formId: props.formId,
      error: error(),
      required: required(),
    });

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
    get error() {
      return error();
    },
    get inputProps() {
      const a = aria();
      return {
        id: a.id,
        "aria-invalid": a["aria-invalid"],
        "aria-describedby": a["aria-describedby"],
        "aria-required": a["aria-required"],
      };
    },
  });

  return (
    <Show when={visible()}>
      <Field
        label={plainLabel()}
        required={required()}
        span={props.span}
        as={props.as}
        controlId={props.as === "div" ? aria().id : undefined}
        error={error()}
        errorId={aria().errorId}
      >
        {props.children(meta())}
      </Field>
    </Show>
  );
}
