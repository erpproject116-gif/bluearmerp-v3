import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ModalField } from "./ModalField";
import type { FormFieldSetting } from "./useFormFieldSettings";

function setting(partial: Partial<FormFieldSetting> & { field_key: string }): FormFieldSetting {
  return {
    kind: "standard",
    label: partial.label ?? partial.field_key,
    field_type: "text",
    is_visible: true,
    is_required: false,
    is_disabled: false,
    is_active: true,
    sort_order: 0,
    ...partial,
  };
}

describe("ModalField", () => {
  it("renders children with label when visible", () => {
    const settings = () => ({
      partner_id: setting({ field_key: "partner_id", label: "Customer", is_required: true }),
    });
    render(() => (
      <ModalField settings={settings} fieldKey="partner_id" fallbackLabel="Partner" formId="test-form">
        {(m) => <input {...m.inputProps} aria-label={m.label} disabled={m.disabled} />}
      </ModalField>
    ));
    expect(screen.getByLabelText(/Customer/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Customer/)).toHaveAttribute("id", "test-form-partner_id");
  });

  it("hides when settings mark field invisible", () => {
    const settings = () => ({
      notes: setting({ field_key: "notes", label: "Notes", is_visible: false }),
    });
    render(() => (
      <ModalField settings={settings} fieldKey="notes" fallbackLabel="Notes">
        {() => <textarea aria-label="Notes" />}
      </ModalField>
    ));
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });

  it("passes disabled meta from settings", () => {
    const settings = () => ({
      code: setting({ field_key: "code", label: "Code", is_disabled: true }),
    });
    render(() => (
      <ModalField settings={settings} fieldKey="code" fallbackLabel="Code">
        {(m) => <input aria-label="Code field" disabled={m.disabled} />}
      </ModalField>
    ));
    expect(screen.getByLabelText("Code field")).toBeDisabled();
  });

  it("shows inline error from errors map", () => {
    const settings = () => ({
      email: setting({ field_key: "email", label: "Email" }),
    });
    const errors = () => ({ email: "Enter a valid email address." });
    render(() => (
      <ModalField settings={settings} fieldKey="email" fallbackLabel="Email" errors={errors} formId="partner-form">
        {(m) => <input {...m.inputProps} />}
      </ModalField>
    ));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});
