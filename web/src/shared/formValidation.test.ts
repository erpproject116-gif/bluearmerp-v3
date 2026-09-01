import { describe, expect, it } from "vitest";
import {
  collectRequiredFieldErrors,
  isFieldValueMissing,
  requireFields,
} from "./handleSaveResult";
import { collectDocumentLookupErrors } from "./documentFormValidation";
import { mergeFormErrors, formErrorsSummary } from "./formValidation";

describe("formValidation", () => {
  it("collectRequiredFieldErrors returns keyed messages", () => {
    const errors = collectRequiredFieldErrors({ company_name: "" }, [{ key: "company_name", label: "Company name" }]);
    expect(errors.company_name).toBe("Company name is required.");
  });

  it("requireFields returns summary string", () => {
    expect(requireFields({}, [{ key: "x", label: "X" }])).toBe("X is required.");
  });

  it("mergeFormErrors combines maps", () => {
    const merged = mergeFormErrors({ a: "A" }, { b: "B" });
    expect(merged).toEqual({ a: "A", b: "B" });
  });

  it("collectDocumentLookupErrors flags missing lookups", () => {
    const errors = collectDocumentLookupErrors({ partner_id: null, location_id: 1, tax_type_id: 2, currency_id: 3 });
    expect(errors.partner_id).toBeTruthy();
    expect(errors.location_id).toBeUndefined();
  });

  it("isFieldValueMissing treats empty string as missing", () => {
    expect(isFieldValueMissing("  ")).toBe(true);
    expect(isFieldValueMissing("ok")).toBe(false);
  });

  it("formErrorsSummary pluralizes multiple errors", () => {
    expect(formErrorsSummary({ a: "A", b: "B" })).toBe("Please fix 2 fields below.");
  });
});
