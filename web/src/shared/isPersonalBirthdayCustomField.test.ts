import { describe, expect, it } from "vitest";
import { isPersonalBirthdayCustomField } from "./CustomFieldsSection";

describe("isPersonalBirthdayCustomField", () => {
  it("matches birthday / DOB labels and keys", () => {
    expect(isPersonalBirthdayCustomField({ field_key: "birthday", label: "Birthday" })).toBe(true);
    expect(isPersonalBirthdayCustomField({ field_key: "birth_date", label: "Birth date" })).toBe(true);
    expect(isPersonalBirthdayCustomField({ field_key: "dob", label: "DOB" })).toBe(true);
  });

  it("does not match normal quotation fields", () => {
    expect(isPersonalBirthdayCustomField({ field_key: "payment_terms", label: "Payment terms" })).toBe(false);
    expect(isPersonalBirthdayCustomField({ field_key: "notes", label: "Notes" })).toBe(false);
  });
});
